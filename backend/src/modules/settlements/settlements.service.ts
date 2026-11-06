import { randomUUID } from 'node:crypto';
import { fdPrematureSettlement, finalSettlement, formatDisplayDate, formatINR, keepsAppAccess, lastInterestChargedOn } from '@tgs/domain';
import type { DepositAccount, FinalSettlement, FinalSettlementStatement, Loan, Member, SessionUser, SettlementView } from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessNow, businessToday } from '../../common/utils/business-date';
import { withTransaction, type Tx } from '../../db/transaction';
import { finalSettlements } from '../../models';
import { ACCOUNT, DEPOSIT_ACCOUNT, LOAN_ACCOUNT } from '../ledger/ledger.accounts';
import type { JournalLineInput } from '@tgs/domain';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const HEAD_ACCOUNT: Record<string, string> = { RRF: '2320', INSURANCE: '2400', CRD: DEPOSIT_ACCOUNT.CRD, SRDS: DEPOSIT_ACCOUNT.SRDS, SHARE_CAPITAL: ACCOUNT.SHARE_CAPITAL };
const MEMBER_LEVEL = new Set(['CRD', 'SRDS', 'SHARE_CAPITAL']);
const HEAD_LABEL: Record<string, string> = { RRF: 'RRF', INSURANCE: 'insurance', CRD: 'CRD instalments', SRDS: 'SRDS instalments', SHARE_CAPITAL: 'share capital' };
const FD_INTEREST_PAYABLE = '2210';
const FD_INTEREST_EXPENSE = '5100';
type ExitStatus = FinalSettlement['exit']['status'];


/**
 * F-08 (D-098): a member leaves (retired, resigned, deceased) and is settled: loans with interest to
 * the leaving date, penal and unpaid items against shares, share deposit, CRD / SRDS and FDs. What
 * is still owed is recovered from the gratuity (forms F5 / F6); what is held is paid to the member,
 * or to the nominee after a death. One balanced ledger entry closes everything.
 */
export class SettlementsService {
  constructor(private readonly app: FastifyInstance) {}

  private async load(tx: Tx | undefined, memberId: string, lock = false): Promise<FinalSettlement | undefined> {
    const q = (tx ?? this.app.db).select({ data: finalSettlements.data }).from(finalSettlements).where(eq(finalSettlements.memberId, memberId));
    return (lock && tx ? await q.for('update') : await q)[0]?.data;
  }

  private async save(tx: Tx, s: FinalSettlement, insert = false): Promise<void> {
    if (insert) await tx.insert(finalSettlements).values({ memberId: s.memberId, status: s.status, data: s });
    else await tx.update(finalSettlements).set({ status: s.status, data: s }).where(eq(finalSettlements.memberId, s.memberId));
  }

  private async requireStaff(user: SessionUser, permission: 'members.view' | 'members.edit' | 'collections.postRecovery'): Promise<void> {
    if (user.role === 'MEMBER' || user.role === 'APPLICANT') fail('FORBIDDEN', 'Staff only.');
    if (!(await this.app.permissions.has(user.role, permission))) fail('FORBIDDEN', permission === 'collections.postRecovery' ? 'Only the Accountant posts a final settlement.' : 'You do not have access to this.');
  }

  /** The statement as of the exit date, from the member's live records. */
  async statement(member: Member, exitDate: string, tx?: Tx): Promise<FinalSettlementStatement> {
    const [loans, deposits, share, dues, settings] = await Promise.all([
      this.app.loans.repo.forMember(member.id),
      this.app.deposits.repo.forMember(member.id),
      this.app.collections.repo.share(member.id, tx),
      this.app.collections.duesOf([member.id]),
      this.app.masters.settings(),
    ]);
    const d = dues.get(member.id)!;
    const other = new Map<string, number>();
    for (const a of d.arrears) for (const c of a.components) if (c.head !== 'PRINCIPAL' && c.head !== 'INTEREST' && c.head !== 'SURETY') other.set(c.head, (other.get(c.head) ?? 0) + c.unpaid);
    const fdValue = (f: DepositAccount) => {
      if (f.status === 'MATURED') return { principal: f.principal ?? 0, interest: Math.max(0, (f.maturityValue ?? f.principal ?? 0) - (f.principal ?? 0)) };
      const s = fdPrematureSettlement({ principal: f.principal ?? 0, ratePercent: f.ratePercent, payout: f.payoutFrequency ?? 'ON_MATURITY', openedOn: f.openedOn, today: exitDate, method: settings.fdPrematurePenaltyMethod, penaltyPercent: settings.fdPrematurePenaltyPercent });
      return { principal: s.principal, interest: s.interestPayable };
    };
    const bal = (scheme: string) => sum(deposits.filter((x) => x.scheme === scheme && x.status === 'ACTIVE').map((x) => x.balance));
    return finalSettlement({
      exitDate,
      loans: loans.filter((l) => l.status === 'ACTIVE').map((l) => ({ id: l.id, loanNo: l.loanNo ?? l.applicationNo, product: l.product, outstandingPrincipal: l.outstandingPrincipal, ratePercent: l.ratePercent, lastInterestChargedOn: lastInterestChargedOn(l, exitDate) })),
      penal: d.totalPenal,
      otherDues: [...other].map(([head, amount]) => ({ head, label: HEAD_LABEL[head] ?? head, amount })),
      suretyDues: (d.suretyRecoveries ?? []).map((r) => ({ recoveryId: r.id, label: `As surety for ${r.borrowerName} (${r.loanNo})`, amount: r.due })),
      holds: {
        shareCapital: share?.shareCapital ?? 0,
        shareDeposit: share?.shareDepositBalance ?? 0,
        crd: bal('CRD'),
        srds: bal('SRDS'),
        fds: deposits.filter((f) => f.scheme === 'FD' && (f.status === 'ACTIVE' || f.status === 'MATURED')).map((f) => ({ id: f.id, label: `FD ${f.fdrNo ?? f.accountNo}`, ...fdValue(f) })),
      },
    });
  }

  async view(user: SessionUser, memberId: string): Promise<SettlementView> {
    await this.requireStaff(user, 'members.view');
    const m = (await this.app.members.byId(memberId)) ?? fail('NOT_FOUND', 'Member not found.');
    if (user.role === 'DDO' && m.departmentId !== user.departmentId) fail('NOT_FOUND', 'Member not found.');
    const [s, dept, canExit, canPost] = await Promise.all([this.load(undefined, m.id), this.app.departments.get(m.departmentId), this.app.permissions.has(user.role, 'members.edit'), this.app.permissions.has(user.role, 'collections.postRecovery')]);
    const statement = s?.status === 'POSTED' ? s.posted!.statement : s ? await this.statement(m, s.exit.date) : null;
    return {
      member: { id: m.id, name: m.name, generalNo: m.generalNo, designation: m.designation, status: m.status, nominee: m.nominee, presentAddress: m.presentAddress, departmentName: dept?.name ?? '' },
      department: dept ? { name: dept.name, ddoName: dept.ddoName, ddoDesignation: dept.ddoDesignation } : null,
      settlement: s ?? null,
      statement,
      canExit: canExit && m.status === 'ACTIVE',
      canPost: canPost && s?.status === 'OPEN',
    };
  }

  /** Marks the member as retired, resigned or deceased; demand stops and the settlement opens. */
  async exit(request: FastifyRequest, memberId: string, body: { status?: string; date?: string; remarks?: string }): Promise<SettlementView> {
    const user = sessionOf(request);
    await this.requireStaff(user, 'members.edit');
    const today = await businessToday(this.app);
    const fieldErrors: Record<string, string> = {};
    if (!['RETIRED', 'RESIGNED', 'DECEASED'].includes(body.status ?? '')) fieldErrors.status = 'Choose retired, resigned or deceased';
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || body.date > today) fieldErrors.date = 'Today or earlier';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const status = body.status as ExitStatus;
    const at = await businessNow(this.app);
    await withTransaction(this.app.db, async (tx) => {
      const m = (await this.app.members.repo.find(memberId, tx)) ?? fail('NOT_FOUND', 'Member not found.');
      if (m.status !== 'ACTIVE') fail('INVALID_TRANSITION', 'This member has already left.');
      const next: Member = { ...m, status };
      await this.app.members.repo.update(tx, next);
      await this.app.appAccounts.upsertMember(tx, { id: m.id, generalNo: m.generalNo, employeeId: m.employeeId, name: m.name, mobile: m.mobile, active: keepsAppAccess(status) });
      await this.app.members.repo.addEvent(tx, { id: `sev-${randomUUID().slice(0, 8)}`, memberId: m.id, type: status, date: body.date!, summary: `${status === 'RETIRED' ? 'Retired' : status === 'RESIGNED' ? 'Resigned' : 'Deceased'} on ${formatDisplayDate(body.date!)}${body.remarks?.trim() ? `: ${body.remarks.trim()}` : ''}` });
      await this.save(tx, { memberId: m.id, exit: { status, date: body.date!, ...(body.remarks?.trim() ? { remarks: body.remarks.trim() } : {}), byName: user.name, at }, status: 'OPEN' }, true);
      await this.app.audit.record(request, { action: 'member.exit', entity: 'member', entityId: m.id, summary: `${m.name} (${m.generalNo}) marked ${status.toLowerCase()} from ${formatDisplayDate(body.date!)}; final settlement opened` }, tx);
    });
    return this.view(user, memberId);
  }

  /**
   * Posts the settlement once the money has moved. `offset`: only the net moves (gratuity received
   * or paid out); otherwise both sides move in full. One balanced ledger entry; loans, deposits and
   * shares close; the member's dues and the recoveries they owed as a surety are cleared.
   */
  async post(request: FastifyRequest, memberId: string, body: { offset?: boolean; payTo?: string; received?: number; reference?: string }): Promise<SettlementView> {
    const user = sessionOf(request);
    await this.requireStaff(user, 'collections.postRecovery');
    const [today, at] = [await businessToday(this.app), await businessNow(this.app)];
    await withTransaction(this.app.db, async (tx) => {
      const s = (await this.load(tx, memberId, true)) ?? fail('NOT_FOUND', 'Mark the member as left first.');
      if (s.status !== 'OPEN') fail('INVALID_TRANSITION', 'This settlement is already posted.');
      const m = (await this.app.members.repo.find(memberId, tx))!;
      const st = await this.statement(m, s.exit.date, tx);
      const offset = body.offset !== false;
      const required = offset ? Math.max(0, -st.net) : st.totalOwed;
      const paid = offset ? Math.max(0, st.net) : st.totalHeld;
      const payTo = s.exit.status === 'DECEASED' ? 'NOMINEE' : body.payTo === 'NOMINEE' ? 'NOMINEE' : 'MEMBER';
      const fieldErrors: Record<string, string> = {};
      if ((body.received ?? 0) !== required) fieldErrors.received = required ? `Enter the ${formatINR(required)} received from the pay office` : 'Nothing is to be received';
      if (!body.reference?.trim()) fieldErrors.reference = 'Enter the cheque / transfer reference';
      if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });

      // ---- the ledger entry ----
      const lines: JournalLineInput[] = [];
      const changed = { loans: new Map<string, Loan>(), deposits: new Map<string, DepositAccount>(), shares: new Map() };
      for (const o of st.owes) {
        if (o.part === 'PRINCIPAL') lines.push({ accountCode: LOAN_ACCOUNT[o.product!], debit: 0, credit: o.amount, memberId: m.id, refType: 'LOAN', refId: o.loanId! });
        else if (o.part === 'INTEREST') lines.push({ accountCode: '4100', debit: 0, credit: o.amount });
        else if (o.key === 'penal') lines.push({ accountCode: '4200', debit: 0, credit: o.amount });
        else if (o.head) lines.push({ accountCode: HEAD_ACCOUNT[o.head]!, debit: 0, credit: o.amount, ...(MEMBER_LEVEL.has(o.head) ? { memberId: m.id, refType: o.head === 'SHARE_CAPITAL' ? 'SHARE' : 'DEPOSIT', refId: m.id } : {}) });
        else if (o.recoveryId) {
          const r = (await this.app.collections.repo.openRecoveries(m.id, tx)).find((x) => x.id === o.recoveryId)!;
          lines.push(...(await this.app.collections.collectFromSurety(tx, m.id, r.loanId, o.amount, today, changed as never, { via: 'COUNTER' })));
        }
      }
      for (const h of st.holds) {
        if (h.key === 'shareCapital') lines.push({ accountCode: ACCOUNT.SHARE_CAPITAL, debit: h.amount, credit: 0, memberId: m.id, refType: 'SHARE', refId: m.id });
        else if (h.key === 'shareDeposit') lines.push({ accountCode: ACCOUNT.SHARE_DEPOSIT, debit: h.amount, credit: 0, memberId: m.id, refType: 'SHARE', refId: m.id });
        else if (h.key === 'crd' || h.key === 'srds') lines.push({ accountCode: DEPOSIT_ACCOUNT[h.key === 'crd' ? 'CRD' : 'SRDS'], debit: h.amount, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: m.id });
        else if (h.fdId) {
          const fd = (await this.app.deposits.repo.lock(tx, h.fdId))!;
          const accrued = Math.min(fd.maturityInterestAccrued ?? 0, h.interest ?? 0);
          lines.push({ accountCode: DEPOSIT_ACCOUNT.FD, debit: h.principal!, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: fd.id });
          if (accrued > 0) lines.push({ accountCode: FD_INTEREST_PAYABLE, debit: accrued, credit: 0, memberId: m.id, refType: 'DEPOSIT', refId: fd.id });
          if ((h.interest ?? 0) - accrued > 0) lines.push({ accountCode: FD_INTEREST_EXPENSE, debit: h.interest! - accrued, credit: 0 });
          await this.app.deposits.repo.save(tx, { ...fd, status: 'CLOSED', balance: 0, closedOn: today, cancelledReason: `Final settlement (${s.exit.status.toLowerCase()})` });
        }
      }
      if (required) lines.push({ accountCode: ACCOUNT.BANK, debit: required, credit: 0 });
      if (paid) lines.push({ accountCode: ACCOUNT.BANK, debit: 0, credit: paid });
      const entry = lines.length ? await this.app.ledger.post({ entryDate: today, narration: `Final settlement of ${m.name} (${m.generalNo}), ${s.exit.status.toLowerCase()} ${formatDisplayDate(s.exit.date)} · ref ${body.reference!.trim()}`, source: 'FINAL_SETTLEMENT', sourceRef: m.id, postedBy: { id: user.id, name: user.name }, lines }, tx) : undefined;

      // ---- the records ----
      for (const l of (await this.app.loans.repo.forMember(m.id)).filter((x) => x.status === 'ACTIVE')) {
        const locked = (await this.app.loans.repo.lock(tx, l.id))!;
        await this.app.loans.repo.save(tx, { ...locked, status: 'CLOSED', outstandingPrincipal: 0, closedOn: today, events: [...locked.events, { at, actorId: user.id, actorName: user.name, actorRole: user.role, action: 'settle', fromStatus: 'ACTIVE', toStatus: 'CLOSED', remarks: 'Closed in the final settlement' }] });
        for (const r of (await this.app.collections.repo.recoveriesOfLoan(l.id, tx)).filter((x) => x.status === 'OPEN')) await this.app.collections.repo.saveRecovery(tx, { ...r, status: 'CLOSED', closedReason: 'BORROWER_PAID' });
      }
      for (const { sheet } of (await this.app.collections.repo.linesOfMember(m.id, tx)).filter((x) => x.sheet.status === 'RECOVERY_POSTED')) {
        const sh = (await this.app.collections.repo.sheet(sheet.id, tx, true))!;
        const line = sh.lines.find((x) => x.memberId === m.id)!;
        if (line.components.every((c) => c.allocated >= c.amount) && !line.penal?.carried) continue;
        line.components = line.components.map((c) => ({ ...c, allocated: c.amount }));
        line.recovered = line.totalDemand;
        if (line.penal) line.penal = { ...line.penal, carried: 0, settledTo: today };
        await this.app.collections.repo.saveLine(tx, sh.id, line);
        sh.totalRecovered = sum(sh.lines.map((x) => x.recovered ?? 0));
        const { lines: _l, ...head } = sh;
        await this.app.collections.repo.saveSheetHead(tx, head);
      }
      for (const dep of (await this.app.deposits.repo.forMember(m.id)).filter((x) => (x.scheme === 'CRD' || x.scheme === 'SRDS') && x.status === 'ACTIVE')) await this.app.deposits.repo.save(tx, { ...dep, status: 'CLOSED', balance: 0, closedOn: today });
      const share = await this.app.collections.repo.lockShare(tx, m.id);
      if (share) await this.app.collections.repo.saveShare(tx, { ...share, numberOfShares: 0, shareCapital: 0, shareDepositBalance: 0 });

      const payeeName = payTo === 'NOMINEE' ? (m.nominee?.name ?? 'Nominee') : m.name;
      await this.save(tx, { ...s, status: 'POSTED', posted: { statement: st, offset, payTo, payeeName, received: required, paid, reference: body.reference!.trim(), byName: user.name, at, ...(entry ? { journalNo: `JE-${String(entry.entryNo).padStart(6, '0')}` } : {}) } });
      await this.app.audit.record(request, { action: 'member.settle', entity: 'member', entityId: m.id, summary: `Final settlement of ${m.name}: owed ${formatINR(st.totalOwed)}, held ${formatINR(st.totalHeld)}; received ${formatINR(required)}, paid ${formatINR(paid)} to ${payeeName}` }, tx);
    });
    return this.view(user, memberId);
  }
}
