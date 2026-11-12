import { annualDepositInterest, dividendOn, financialYearOf, financialYearRange, formatINR, monthEnds, signedBalance, yearCloseLines, type JournalLineInput } from '@tgs/domain';
import type { DividendPreview, HeadInput, InterestPreview, InterestScheme, LedgerHead, OfficeVoucher, OfficeVoucherInput, OfficeVoucherList, YearEndStatus } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessToday } from '../../common/utils/business-date';
import { withTransaction } from '../../db/transaction';
import { ACCOUNT, DEPOSIT_ACCOUNT } from '../ledger/ledger.accounts';
import { entryNo } from '../ledger/ledger.service';
import type { AccountsRepository, VoucherRow } from './accounts.repository';

/** BR-044: which ledger account holds each scheme's member balances, and where its interest is charged. */
const SCHEMES: Array<{ scheme: InterestScheme; account: string; expense: string }> = [
  { scheme: 'SHARE_DEPOSIT', account: ACCOUNT.SHARE_DEPOSIT, expense: ACCOUNT.SHARE_DEPOSIT_INTEREST },
  { scheme: 'CRD', account: DEPOSIT_ACCOUNT.CRD, expense: ACCOUNT.DEPOSIT_INTEREST },
  { scheme: 'SRDS', account: DEPOSIT_ACCOUNT.SRDS, expense: ACCOUNT.DEPOSIT_INTEREST },
];
const SRC = { VOUCHER: 'VOUCHER', INTEREST: 'ANNUAL_INTEREST', DIVIDEND: 'DIVIDEND', DIVIDEND_PAY: 'DIVIDEND_PAYMENT', CLOSE: 'YEAR_CLOSE' } as const;

/**
 * G2 (D-112): the society's own accounts. Office vouchers (income and expenses by cash or bank),
 * sub-heads, and the year end: annual interest on the share deposit / CRD / SRDS (BR-044), dividend
 * (BR-045) and closing the year (BR-046). Every amount goes through `app.ledger.post`.
 */
export class AccountsService {
  constructor(
    private readonly app: FastifyInstance,
    readonly repo: AccountsRepository,
  ) {}

  private async fyStart(): Promise<number> {
    return (await this.app.masters.settings()).financialYearStartMonth;
  }

  // ---- Heads ----------------------------------------------------------------------------------

  heads(): Promise<LedgerHead[]> {
    return this.app.ledger.accounts() as Promise<LedgerHead[]>;
  }

  /** A sub-head under an income or expense head: code 5800.01, 5800.02 … */
  async addHead(request: FastifyRequest, body: HeadInput): Promise<LedgerHead> {
    const name = (body.name ?? '').trim();
    if (name.length < 3 || name.length > 80) fail('VALIDATION_ERROR', 'Give the head a name (3 to 80 letters).', { fieldErrors: { name: 'Enter a name' } });
    const parent = (await this.app.ledger.repo.accountsByCode([body.parentCode])).get(body.parentCode) ?? fail('VALIDATION_ERROR', 'Choose the head it belongs under.', { fieldErrors: { parentCode: 'Choose a head' } });
    if (parent.type !== 'INCOME' && parent.type !== 'EXPENSE') fail('VALIDATION_ERROR', 'Sub-heads go under an income or expense head.', { fieldErrors: { parentCode: 'Income or expense only' } });
    if (parent.parentCode) fail('VALIDATION_ERROR', 'Choose a main head, not a sub-head.', { fieldErrors: { parentCode: 'Main heads only' } });
    const code = await withTransaction(this.app.db, async (tx) => {
      const n = await this.repo.childCount(tx, parent.code);
      if (n >= 99) fail('RULE_VIOLATION', 'This head already has 99 sub-heads.');
      const c = `${parent.code}.${String(n + 1).padStart(2, '0')}`;
      await this.repo.insertHead(tx, { code: c, name, type: parent.type, memberLevel: false, active: true, sortOrder: parent.sortOrder, description: null, parentCode: parent.code });
      await this.app.audit.record(request, { action: 'ledger.head', entity: 'account', entityId: c, summary: `Added head ${c} ${name} under ${parent.name}` }, tx);
      return c;
    });
    return (await this.heads()).find((h) => h.code === code)!;
  }

  /** Rename or close a sub-head (main heads are fixed: modules post to them). */
  async updateHead(request: FastifyRequest, code: string, body: { name?: string; active?: boolean }): Promise<LedgerHead> {
    const head = (await this.app.ledger.repo.accountsByCode([code])).get(code) ?? fail('NOT_FOUND', 'Unknown head.');
    if (!head.parentCode) fail('RULE_VIOLATION', 'Only sub-heads you added can be changed.');
    const patch: { name?: string; active?: boolean } = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 3 || name.length > 80) fail('VALIDATION_ERROR', 'Give the head a name (3 to 80 letters).', { fieldErrors: { name: 'Enter a name' } });
      patch.name = name;
    }
    if (body.active !== undefined) patch.active = body.active;
    await this.repo.updateHead(code, patch);
    await this.app.audit.record(request, { action: 'ledger.head', entity: 'account', entityId: code, summary: `Changed head ${code}: ${patch.name ?? head.name}${patch.active === false ? ' (closed)' : patch.active ? ' (reopened)' : ''}`, before: { name: head.name, active: head.active }, after: patch });
    return (await this.heads()).find((h) => h.code === code)!;
  }

  // ---- Office vouchers -----------------------------------------------------------------------

  private async toVoucher(v: VoucherRow & { entryNo: number }): Promise<OfficeVoucher> {
    const [head, reversal] = await Promise.all([this.app.ledger.repo.accountsByCode([v.headCode]), this.app.ledger.repo.reversalOf(v.entryId)]);
    return {
      id: v.id,
      voucherNo: v.voucherNo,
      kind: v.kind,
      date: v.voucherDate,
      headCode: v.headCode,
      headName: head.get(v.headCode)?.name ?? v.headCode,
      amount: v.amount,
      mode: v.mode,
      ...(v.reference ? { reference: v.reference } : {}),
      party: v.party,
      narration: v.narration,
      entryId: v.entryId,
      entryNo: entryNo(v.entryNo),
      reversed: Boolean(reversal),
      createdByName: v.createdByName,
      createdAt: v.createdAt.toISOString(),
    };
  }

  async vouchers(q: { from?: string; to?: string; kind?: string; page?: number; pageSize?: number }): Promise<OfficeVoucherList> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const { rows, total } = await this.repo.vouchers(q, page, pageSize);
    return { items: await Promise.all(rows.map((r) => this.toVoucher(r))), page, pageSize, total };
  }

  async voucher(id: string): Promise<OfficeVoucher> {
    return this.toVoucher((await this.repo.voucher(id)) ?? fail('NOT_FOUND', 'Voucher not found.'));
  }

  /** A payment (expense) or receipt (other income) by cash or bank: one balanced entry. */
  async createVoucher(request: FastifyRequest, body: OfficeVoucherInput): Promise<OfficeVoucher> {
    const user = sessionOf(request);
    const today = await businessToday(this.app);
    const date = body.date ?? today;
    const e: Record<string, string> = {};
    if (body.kind !== 'PAYMENT' && body.kind !== 'RECEIPT') e.kind = 'Choose payment or receipt';
    if (body.mode !== 'CASH' && body.mode !== 'BANK') e.mode = 'Choose cash or bank';
    if (!Number.isInteger(body.amount) || body.amount <= 0) e.amount = 'Enter the amount';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) e.date = 'Not after today';
    if ((body.party ?? '').trim().length < 2) e.party = body.kind === 'RECEIPT' ? 'Who paid it' : 'Who it was paid to';
    if ((body.narration ?? '').trim().length < 3) e.narration = 'Say what it is for';
    if (body.mode === 'BANK' && !(body.reference ?? '').trim()) e.reference = 'Cheque or transfer reference';
    const head = (await this.app.ledger.repo.accountsByCode([body.headCode])).get(body.headCode);
    const wanted = body.kind === 'RECEIPT' ? 'INCOME' : 'EXPENSE';
    if (!head || head.type !== wanted) e.headCode = body.kind === 'RECEIPT' ? 'Choose an income head' : 'Choose an expense head';
    else if (!head.active) e.headCode = 'This head is closed';
    if (Object.keys(e).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: e });

    const money = body.mode === 'CASH' ? ACCOUNT.CASH : ACCOUNT.BANK;
    const pay = body.kind === 'PAYMENT';
    const lines: JournalLineInput[] = [
      { accountCode: body.headCode, debit: pay ? body.amount : 0, credit: pay ? 0 : body.amount },
      { accountCode: money, debit: pay ? 0 : body.amount, credit: pay ? body.amount : 0 },
    ];
    const id = await withTransaction(this.app.db, async (tx) => {
      const no = await this.repo.nextVoucherNo(tx, pay ? 'PV' : 'RV', financialYearOf(date, await this.fyStart()).slice(0, 4));
      const party = body.party.trim();
      const narration = body.narration.trim();
      const entry = await this.app.ledger.post({ entryDate: date, narration: `${no} ${pay ? 'paid to' : 'received from'} ${party}: ${narration}`, source: SRC.VOUCHER, sourceRef: no, lines, postedBy: user }, tx);
      const v = await this.repo.insertVoucher(tx, { voucherNo: no, kind: body.kind, voucherDate: date, headCode: body.headCode, amount: body.amount, mode: body.mode, reference: body.reference?.trim() || null, party, narration, entryId: entry.id, createdBy: user.id, createdByName: user.name });
      await this.app.audit.record(request, { action: 'voucher.create', entity: 'voucher', entityId: no, summary: `${no}: ${formatINR(body.amount)} ${pay ? 'paid to' : 'received from'} ${party} (${head!.name})` }, tx);
      return v.id;
    });
    return this.voucher(id);
  }

  // ---- Year end ------------------------------------------------------------------------------

  private async range(fy: string) {
    const start = await this.fyStart();
    try {
      return { ...financialYearRange(fy, start), start };
    } catch {
      return fail('VALIDATION_ERROR', 'Choose a financial year.', { fieldErrors: { fy: 'Choose a year' } });
    }
  }

  async yearEnd(fyIn?: string): Promise<YearEndStatus> {
    const today = await businessToday(this.app);
    const start = await this.fyStart();
    const fy = fyIn ?? financialYearOf(today, start);
    const { from, to } = await this.range(fy);
    const [year, totals, accounts, interest, dividend, span] = await Promise.all([
      this.repo.year(fy),
      this.app.ledger.repo.totalsBetween({ from, to }, [SRC.CLOSE]),
      this.app.ledger.repo.accounts(),
      this.app.ledger.repo.bySource(SRC.INTEREST, fy),
      this.app.ledger.repo.bySource(SRC.DIVIDEND, fy),
      this.repo.entrySpan(),
    ]);
    const type = new Map(accounts.map((a) => [a.code, a.type]));
    let income = 0;
    let expense = 0;
    for (const t of totals) {
      const ty = type.get(t.accountCode);
      if (ty === 'INCOME') income += signedBalance(ty, Number(t.debit), Number(t.credit));
      if (ty === 'EXPENSE') expense += signedBalance(ty, Number(t.debit), Number(t.credit));
    }
    const closedThrough = await this.app.ledger.repo.closedThrough();
    const blockers: string[] = [];
    if (year) blockers.push('This year is already closed.');
    else {
      if (to >= today) blockers.push(`The year ends on ${to}. Close it after that day.`);
      if (closedThrough && from <= closedThrough) blockers.push('A later year is already closed.');
      const prev = financialYearOf(new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), start);
      if (span.first && span.first < from && !(await this.repo.year(prev))) blockers.push(`Close ${prev} first.`);
    }
    const paid = dividend ? await this.app.ledger.repo.bySource(SRC.DIVIDEND_PAY, fy) : undefined;
    // Every year from the first posting to today, newest first.
    const firstYear = Number(financialYearOf(span.first && span.first < today ? span.first : today, start).slice(0, 4));
    const lastYear = Number(financialYearOf(span.last && span.last > today ? span.last : today, start).slice(0, 4));
    const years: string[] = [];
    for (let y = lastYear; y >= firstYear; y--) years.push(financialYearOf(`${y}-${String(start).padStart(2, '0')}-01`, start));
    return {
      fy,
      from,
      to,
      today,
      years,
      closed: year ? { closedAt: year.closedAt.toISOString(), closedByName: year.closedByName, surplus: year.surplus } : null,
      income,
      expense,
      surplus: year ? year.surplus : income - expense,
      interestPosted: interest ? { entryNo: entryNo(interest.entryNo), total: interest.total } : null,
      dividend: dividend ? { entryNo: entryNo(dividend.entryNo), ratePercent: Number(/@ ([\d.]+)%/.exec(dividend.narration)?.[1] ?? 0), total: dividend.total, paid: Boolean(paid) } : null,
      canClose: blockers.length === 0,
      blockers,
    };
  }

  /** BR-044: the year's interest per member and scheme, from the ledger balances at the month ends. */
  async interestPreview(fy: string): Promise<InterestPreview> {
    const { start } = await this.range(fy);
    const [settings, members, posted] = await Promise.all([this.app.masters.settings(), this.app.members.all(), this.app.ledger.repo.bySource(SRC.INTEREST, fy)]);
    const rates: Record<InterestScheme, number> = { SHARE_DEPOSIT: settings.shareDepositRatePercent, CRD: settings.crdRatePercent, SRDS: settings.srdsRatePercent };
    const ends = monthEnds(fy, start);
    const balances = await this.app.ledger.repo.memberCreditBalancesAt(SCHEMES.map((s) => s.account), ends);
    const per = new Map<string, number[]>();
    for (const b of balances) {
      const k = `${b.memberId}|${b.accountCode}`;
      const arr = per.get(k) ?? new Array<number>(12).fill(0);
      arr[ends.indexOf(b.d)] = b.balance;
      per.set(k, arr);
    }
    const byId = new Map(members.map((m) => [m.id, m]));
    const rows: InterestPreview['rows'] = [];
    for (const [k, arr] of per) {
      const [memberId, account] = k.split('|') as [string, string];
      const s = SCHEMES.find((x) => x.account === account)!;
      const interest = annualDepositInterest(arr, rates[s.scheme], settings.depositInterestBasis);
      if (interest <= 0) continue;
      const m = byId.get(memberId);
      rows.push({ memberId, generalNo: m?.generalNo ?? '', name: m?.name ?? memberId, scheme: s.scheme, balance: arr[11]!, interest });
    }
    rows.sort((a, b) => a.generalNo.localeCompare(b.generalNo) || a.scheme.localeCompare(b.scheme));
    const tot = (s: InterestScheme) => rows.filter((r) => r.scheme === s).reduce((n, r) => n + r.interest, 0);
    const totals = { SHARE_DEPOSIT: tot('SHARE_DEPOSIT'), CRD: tot('CRD'), SRDS: tot('SRDS'), all: 0 };
    totals.all = totals.SHARE_DEPOSIT + totals.CRD + totals.SRDS;
    return { fy, basis: settings.depositInterestBasis, rates, rows, totals, posted: posted ? { entryNo: entryNo(posted.entryNo) } : null };
  }

  /** Credits the year's interest to each member's account, dated the last day of the year. Once per year. */
  async postInterest(request: FastifyRequest, fy: string): Promise<InterestPreview> {
    const user = sessionOf(request);
    const { to } = await this.range(fy);
    if (to >= (await businessToday(this.app))) fail('RULE_VIOLATION', `Interest for ${fy} is credited after the year ends on ${to}.`);
    const p = await this.interestPreview(fy);
    if (p.posted) fail('ALREADY_POSTED', `Interest for ${fy} was already credited (${p.posted.entryNo}).`);
    if (!p.rows.length) fail('RULE_VIOLATION', 'No member has interest to credit for this year.');
    await withTransaction(this.app.db, async (tx) => {
      if (await this.app.ledger.repo.bySource(SRC.INTEREST, fy, tx)) fail('ALREADY_POSTED', `Interest for ${fy} was already credited.`);
      const lines: JournalLineInput[] = [];
      for (const s of SCHEMES) {
        const rows = p.rows.filter((r) => r.scheme === s.scheme);
        for (const r of rows) lines.push({ accountCode: s.account, debit: 0, credit: r.interest, memberId: r.memberId, refType: s.scheme === 'SHARE_DEPOSIT' ? 'SHARE' : 'DEPOSIT', refId: r.memberId });
      }
      const shareTotal = p.totals.SHARE_DEPOSIT;
      const depositTotal = p.totals.CRD + p.totals.SRDS;
      if (shareTotal) lines.push({ accountCode: ACCOUNT.SHARE_DEPOSIT_INTEREST, debit: shareTotal, credit: 0 });
      if (depositTotal) lines.push({ accountCode: ACCOUNT.DEPOSIT_INTEREST, debit: depositTotal, credit: 0 });
      await this.app.ledger.post({ entryDate: to, narration: `Annual interest for ${fy} on share deposit, CRD and SRDS`, source: SRC.INTEREST, sourceRef: fy, lines, postedBy: user }, tx);
      // Keep the account balances the apps show in step with the books.
      for (const r of p.rows) {
        if (r.scheme === 'SHARE_DEPOSIT') await this.app.collections.creditShareDeposit(tx, r.memberId, r.interest);
        else {
          const dep = await this.app.deposits.lockCompulsory(tx, r.memberId, r.scheme);
          if (dep) await this.app.deposits.repo.save(tx, { ...dep, balance: dep.balance + r.interest });
        }
      }
      await this.app.audit.record(request, { action: 'ledger.annualInterest', entity: 'journal', entityId: fy, summary: `Credited ${formatINR(p.totals.all)} annual interest for ${fy} to ${new Set(p.rows.map((r) => r.memberId)).size} members` }, tx);
    });
    return this.interestPreview(fy);
  }

  /** BR-045: dividend on each member's share capital at the year end. */
  async dividendPreview(fy: string, ratePercent: number): Promise<DividendPreview> {
    const { to } = await this.range(fy);
    const [members, declared, paid] = await Promise.all([this.app.members.all(), this.app.ledger.repo.bySource(SRC.DIVIDEND, fy), this.app.ledger.repo.bySource(SRC.DIVIDEND_PAY, fy)]);
    const rate = declared ? Number(/@ ([\d.]+)%/.exec(declared.narration)?.[1] ?? ratePercent) : ratePercent;
    const byId = new Map(members.map((m) => [m.id, m]));
    const rows = (await this.app.ledger.repo.memberCreditBalancesAt([ACCOUNT.SHARE_CAPITAL], [to]))
      .map((b) => ({ memberId: b.memberId, generalNo: byId.get(b.memberId)?.generalNo ?? '', name: byId.get(b.memberId)?.name ?? b.memberId, shareCapital: b.balance, dividend: dividendOn(b.balance, rate) }))
      .filter((r) => r.dividend > 0)
      .sort((a, b) => a.generalNo.localeCompare(b.generalNo));
    return {
      fy,
      ratePercent: rate,
      rows,
      total: rows.reduce((n, r) => n + r.dividend, 0),
      declared: declared ? { entryNo: entryNo(declared.entryNo), ratePercent: rate, resolution: /\(([^)]*)\)$/.exec(declared.narration)?.[1] ?? '' } : null,
      paid: paid ? { entryNo: entryNo(paid.entryNo) } : null,
    };
  }

  /** Declared after the general body approves the rate, out of the closed year's surplus. */
  async declareDividend(request: FastifyRequest, body: { fy: string; ratePercent: number; resolution: string }): Promise<DividendPreview> {
    const user = sessionOf(request);
    const e: Record<string, string> = {};
    if (!(body.ratePercent > 0 && body.ratePercent <= 25)) e.ratePercent = 'Use more than 0% and at most 25%';
    if ((body.resolution ?? '').trim().length < 3) e.resolution = 'General body resolution number and date';
    if (Object.keys(e).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: e });
    if (!(await this.repo.year(body.fy))) fail('RULE_VIOLATION', `Close ${body.fy} first: the dividend comes out of its surplus.`);
    const p = await this.dividendPreview(body.fy, body.ratePercent);
    if (p.declared) fail('ALREADY_POSTED', `The dividend for ${body.fy} was already declared (${p.declared.entryNo}).`);
    if (!p.rows.length) fail('RULE_VIOLATION', 'No member held share capital at the year end.');
    const today = await businessToday(this.app);
    await withTransaction(this.app.db, async (tx) => {
      if (await this.app.ledger.repo.bySource(SRC.DIVIDEND, body.fy, tx)) fail('ALREADY_POSTED', 'The dividend was already declared.');
      const lines: JournalLineInput[] = [{ accountCode: ACCOUNT.SURPLUS, debit: p.total, credit: 0 }, ...p.rows.map((r) => ({ accountCode: ACCOUNT.DIVIDEND_PAYABLE, debit: 0, credit: r.dividend, memberId: r.memberId, refType: 'SHARE', refId: r.memberId }))];
      await this.app.ledger.post({ entryDate: today, narration: `Dividend for ${body.fy} @ ${body.ratePercent}% on share capital (${body.resolution.trim()})`, source: SRC.DIVIDEND, sourceRef: body.fy, lines, postedBy: user }, tx);
      await this.app.audit.record(request, { action: 'ledger.dividend', entity: 'journal', entityId: body.fy, summary: `Declared ${body.ratePercent}% dividend for ${body.fy}: ${formatINR(p.total)} to ${p.rows.length} members` }, tx);
    });
    return this.dividendPreview(body.fy, body.ratePercent);
  }

  /** Pays every member's declared dividend from the bank in one entry. */
  async payDividend(request: FastifyRequest, fy: string): Promise<DividendPreview> {
    const user = sessionOf(request);
    const p = await this.dividendPreview(fy, 0);
    if (!p.declared) fail('RULE_VIOLATION', `Declare the dividend for ${fy} first.`);
    if (p.paid) fail('ALREADY_POSTED', `The dividend for ${fy} was already paid (${p.paid.entryNo}).`);
    const today = await businessToday(this.app);
    const payable = (await this.app.ledger.repo.memberCreditBalancesAt([ACCOUNT.DIVIDEND_PAYABLE], [today])).filter((b) => b.balance > 0);
    const total = payable.reduce((n, b) => n + b.balance, 0);
    if (!total) fail('RULE_VIOLATION', 'Nothing is left to pay.');
    await withTransaction(this.app.db, async (tx) => {
      if (await this.app.ledger.repo.bySource(SRC.DIVIDEND_PAY, fy, tx)) fail('ALREADY_POSTED', 'The dividend was already paid.');
      const lines: JournalLineInput[] = [...payable.map((b) => ({ accountCode: ACCOUNT.DIVIDEND_PAYABLE, debit: b.balance, credit: 0, memberId: b.memberId, refType: 'SHARE', refId: b.memberId })), { accountCode: ACCOUNT.BANK, debit: 0, credit: total }];
      await this.app.ledger.post({ entryDate: today, narration: `Dividend for ${fy} paid to members' bank accounts`, source: SRC.DIVIDEND_PAY, sourceRef: fy, lines, postedBy: user }, tx);
      await this.app.audit.record(request, { action: 'ledger.dividendPaid', entity: 'journal', entityId: fy, summary: `Paid ${formatINR(total)} dividend for ${fy} to ${payable.length} members` }, tx);
    });
    return this.dividendPreview(fy, 0);
  }

  /** BR-046: income and expenses to the surplus, then the year is locked. */
  async closeYear(request: FastifyRequest, fy: string): Promise<YearEndStatus> {
    const user = sessionOf(request);
    const status = await this.yearEnd(fy);
    if (!status.canClose) fail('RULE_VIOLATION', status.blockers[0] ?? 'This year cannot be closed.');
    await withTransaction(this.app.db, async (tx) => {
      if (await this.repo.year(fy, tx)) fail('ALREADY_POSTED', 'This year is already closed.');
      const [totals, accounts] = await Promise.all([this.app.ledger.repo.totalsBetween({ from: status.from, to: status.to }, [], tx), this.app.ledger.repo.accounts(tx)]);
      const type = new Map(accounts.map((a) => [a.code, a.type]));
      const close = yearCloseLines(
        totals.map((t) => ({ code: t.accountCode, type: type.get(t.accountCode)!, debit: Number(t.debit), credit: Number(t.credit) })),
        ACCOUNT.SURPLUS,
      );
      const entry = close.lines.length ? await this.app.ledger.post({ entryDate: status.to, narration: `Year ${fy} closed: income ${formatINR(close.income)}, expenses ${formatINR(close.expense)}`, source: SRC.CLOSE, sourceRef: fy, lines: close.lines, postedBy: user }, tx) : undefined;
      await this.repo.insertYear(tx, { fy, startDate: status.from, endDate: status.to, closingEntryId: entry?.id ?? null, surplus: close.surplus, closedBy: user.id, closedByName: user.name });
      await this.app.audit.record(request, { action: 'ledger.closeYear', entity: 'financialYear', entityId: fy, summary: `Closed ${fy}: ${close.surplus >= 0 ? 'surplus' : 'deficit'} ${formatINR(Math.abs(close.surplus))}` }, tx);
    });
    return this.yearEnd(fy);
  }
}
