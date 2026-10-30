import { checkJournal, normalSide, reverseLines, signedBalance, type JournalLineInput, type LedgerAccountType } from '@tgs/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { todayIST } from '../../common/utils/dates';
import { withTransaction, type Tx } from '../../db/transaction';
import type { AccountRow, EntryRow, LedgerRepository, LineRow } from './ledger.repository';

export interface PostInput {
  entryDate: string;
  narration: string;
  /** OPENING, MANUAL, REVERSAL; later modules add LOAN_DISBURSEMENT, RECEIPT, FD_PAYMENT, … */
  source: string;
  sourceRef?: string;
  lines: JournalLineInput[];
  postedBy: { id: string; name: string };
  reversesEntryId?: string;
}

export const entryNo = (n: number) => `JE-${String(n).padStart(6, '0')}`;
const toNumber = (v: string | number) => Number(v);

function toEntry(e: EntryRow) {
  return {
    id: e.id,
    entryNo: entryNo(e.entryNo),
    entryDate: e.entryDate,
    narration: e.narration,
    source: e.source,
    ...(e.sourceRef ? { sourceRef: e.sourceRef } : {}),
    ...(e.reversesEntryId ? { reversesEntryId: e.reversesEntryId } : {}),
    total: e.total,
    postedBy: e.postedByName,
    postedAt: e.postedAt.toISOString(),
  };
}

const toLine = (l: LineRow, accounts: Map<string, AccountRow>) => ({
  lineNo: l.lineNo,
  accountCode: l.accountCode,
  accountName: accounts.get(l.accountCode)?.name ?? l.accountCode,
  debit: l.debit,
  credit: l.credit,
  ...(l.memberId ? { memberId: l.memberId } : {}),
  ...(l.refType ? { refType: l.refType } : {}),
  ...(l.refId ? { refId: l.refId } : {}),
});

/**
 * The books (REQ-131). `post` is the only way money enters the ledger: every module posts through
 * it inside its own transaction. Entries are append-only; `reverse` corrects one.
 */
export class LedgerService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: LedgerRepository,
  ) {}

  async accounts() {
    return (await this.repo.accounts()).map((a) => ({ code: a.code, name: a.name, type: a.type, normalSide: normalSide(a.type), memberLevel: a.memberLevel, active: a.active, ...(a.description ? { description: a.description } : {}) }));
  }

  /** Validates and posts one balanced entry in `tx` (the caller's transaction) or a new one. */
  async post(input: PostInput, tx?: Tx): Promise<EntryRow> {
    const check = checkJournal(input.lines);
    if (!check.ok) fail('VALIDATION_ERROR', 'The entry does not balance or has a bad line.', { fieldErrors: check.errors, ruleId: 'LED-3' });
    if (!input.narration.trim()) fail('VALIDATION_ERROR', 'Say what the entry is for.', { fieldErrors: { narration: 'Enter a narration.' } });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) fail('VALIDATION_ERROR', 'Use the date as YYYY-MM-DD.', { fieldErrors: { entryDate: 'Use YYYY-MM-DD' } });

    const run = async (t: Tx) => {
      const accounts = await this.repo.accountsByCode([...new Set(input.lines.map((l) => l.accountCode))], t);
      const errors: Record<string, string> = {};
      input.lines.forEach((l, i) => {
        const a = accounts.get(l.accountCode);
        if (!a) errors[`lines.${i}`] = `Unknown account ${l.accountCode}.`;
        else if (!a.active) errors[`lines.${i}`] = `${a.name} is closed for posting.`;
        else if (a.memberLevel && !l.memberId) errors[`lines.${i}`] = `${a.name} needs the member it belongs to.`;
      });
      if (Object.keys(errors).length) fail('VALIDATION_ERROR', 'Check the accounts on the highlighted lines.', { fieldErrors: errors });
      return this.repo.insertEntry(
        t,
        {
          entryDate: input.entryDate,
          narration: input.narration.trim(),
          source: input.source,
          sourceRef: input.sourceRef ?? null,
          reversesEntryId: input.reversesEntryId ?? null,
          total: check.totalDebit,
          postedBy: input.postedBy.id,
          postedByName: input.postedBy.name,
        },
        input.lines.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit, memberId: l.memberId ?? null, refType: l.refType ?? null, refId: l.refId ?? null })),
      );
    };
    return tx ? run(tx) : withTransaction(this.app.db, run);
  }

  /** Manual journal (Accountant): corrections and items no module posts yet. */
  async postManual(request: FastifyRequest, body: { entryDate?: string; narration: string; lines: JournalLineInput[] }) {
    const user = sessionOf(request);
    const entryDate = body.entryDate ?? todayIST();
    if (entryDate > todayIST()) fail('VALIDATION_ERROR', 'An entry cannot be dated in the future.', { fieldErrors: { entryDate: 'Not after today' } });
    const entry = await withTransaction(this.app.db, async (tx) => {
      const e = await this.post({ entryDate, narration: body.narration, source: 'MANUAL', lines: body.lines, postedBy: user }, tx);
      await this.app.audit.record(request, { action: 'ledger.post', entity: 'journal', entityId: e.id, summary: `Posted ${entryNo(e.entryNo)}: ${e.narration}`, after: body }, tx);
      return e;
    });
    return this.journal(entry.id);
  }

  /** A correction never edits: it posts the mirror image of the entry, dated today. */
  async reverse(request: FastifyRequest, id: string, reason: string) {
    const user = sessionOf(request);
    const original = (await this.repo.entry(id)) ?? fail('NOT_FOUND', 'Unknown journal entry.');
    if (original.reversesEntryId) fail('INVALID_TRANSITION', 'This entry is itself a reversal. Post a new entry instead.');
    if (await this.repo.reversalOf(id)) fail('INVALID_TRANSITION', 'This entry has already been reversed.');
    const lines = (await this.repo.linesOf(id)).map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit, memberId: l.memberId ?? undefined, refType: l.refType ?? undefined, refId: l.refId ?? undefined }));
    const entry = await withTransaction(this.app.db, async (tx) => {
      const e = await this.post(
        { entryDate: todayIST(), narration: `Reversal of ${entryNo(original.entryNo)}: ${reason.trim()}`, source: 'REVERSAL', sourceRef: original.id, reversesEntryId: original.id, lines: reverseLines(lines), postedBy: user },
        tx,
      ).catch((err: { code?: string }) => {
        // Two reversals at the same moment: the unique index lets only one through.
        if (err?.code === '23505') fail('INVALID_TRANSITION', 'This entry has already been reversed.');
        throw err;
      });
      await this.app.audit.record(request, { action: 'ledger.reverse', entity: 'journal', entityId: original.id, summary: `Reversed ${entryNo(original.entryNo)} with ${entryNo(e.entryNo)}: ${reason.trim()}` }, tx);
      return e;
    });
    return this.journal(entry.id);
  }

  async journal(id: string) {
    const e = (await this.repo.entry(id)) ?? fail('NOT_FOUND', 'Unknown journal entry.');
    const [lines, accounts, reversal] = await Promise.all([this.repo.linesOf(id), this.accountMap(), this.repo.reversalOf(id)]);
    return { ...toEntry(e), lines: lines.map((l) => toLine(l, accounts)), ...(reversal ? { reversedBy: { id: reversal.id, entryNo: entryNo(reversal.entryNo) } } : {}) };
  }

  async journals(filter: { from?: string; to?: string; source?: string }, page: number, pageSize: number) {
    const { rows, total } = await this.repo.entries(filter, page, pageSize);
    return { items: rows.map(toEntry), page, pageSize, total };
  }

  /** Trial balance: per account debit and credit totals; the two columns must agree. */
  async trialBalance(asOf?: string) {
    const [totals, accounts] = await Promise.all([this.repo.totalsByAccount(asOf), this.repo.accounts()]);
    const byCode = new Map(totals.map((t) => [t.accountCode, { debit: toNumber(t.debit), credit: toNumber(t.credit) }]));
    const rows = accounts
      .filter((a) => byCode.has(a.code))
      .map((a) => {
        const { debit, credit } = byCode.get(a.code)!;
        // Shown on the side where the net balance falls, as in a printed trial balance.
        const net = debit - credit;
        return { code: a.code, name: a.name, type: a.type, debit, credit, balance: signedBalance(a.type, debit, credit), debitBalance: Math.max(net, 0), creditBalance: Math.max(-net, 0) };
      });
    const totalDebit = rows.reduce((s, r) => s + r.debitBalance, 0);
    const totalCredit = rows.reduce((s, r) => s + r.creditBalance, 0);
    return { asOf: asOf ?? todayIST(), rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
  }

  /** One account's lines with a running balance (GL). */
  async accountLedger(code: string, range: { from?: string; to?: string }, limit: number) {
    const account = (await this.repo.accountsByCode([code])).get(code) ?? fail('NOT_FOUND', 'Unknown account.');
    const opening = range.from ? await this.openingBalance(range.from, { accountCode: code }) : new Map<string, number>();
    let running = opening.get(code) ?? 0;
    const lines = (await this.repo.lines({ ...range, accountCode: code }, limit)).map(({ line, entry }) => {
      running += signedBalance(account.type, line.debit, line.credit);
      return { entryId: entry.id, entryNo: entryNo(entry.entryNo), entryDate: entry.entryDate, narration: entry.narration, debit: line.debit, credit: line.credit, balance: running, ...(line.memberId ? { memberId: line.memberId } : {}) };
    });
    return { account: { code: account.code, name: account.name, type: account.type }, openingBalance: opening.get(code) ?? 0, lines, closingBalance: running };
  }

  /** A member's statement across every account they have (loans, shares, deposits). */
  async memberStatement(memberId: string, range: { from?: string; to?: string }, limit: number) {
    const accounts = await this.accountMap();
    const opening = range.from ? await this.openingBalance(range.from, { memberId }) : new Map<string, number>();
    const running = new Map(opening);
    const lines = (await this.repo.lines({ ...range, memberId }, limit)).map(({ line, entry }) => {
      const a = accounts.get(line.accountCode)!;
      const next = (running.get(line.accountCode) ?? 0) + signedBalance(a.type as LedgerAccountType, line.debit, line.credit);
      running.set(line.accountCode, next);
      return { entryId: entry.id, entryNo: entryNo(entry.entryNo), entryDate: entry.entryDate, narration: entry.narration, accountCode: line.accountCode, accountName: a.name, debit: line.debit, credit: line.credit, balance: next, ...(line.refType ? { refType: line.refType, refId: line.refId ?? '' } : {}) };
    });
    const balances = [...running.entries()].map(([code, balance]) => ({ accountCode: code, accountName: accounts.get(code)?.name ?? code, balance })).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return { memberId, balances, lines };
  }

  private async openingBalance(before: string, filter: { accountCode?: string; memberId?: string }): Promise<Map<string, number>> {
    const [rows, accounts] = await Promise.all([this.repo.openingTotals(before, filter), this.accountMap()]);
    return new Map(rows.map((r) => [r.accountCode, signedBalance(accounts.get(r.accountCode)!.type, toNumber(r.debit), toNumber(r.credit))]));
  }

  private async accountMap(): Promise<Map<string, AccountRow>> {
    return new Map((await this.repo.accounts()).map((a) => [a.code, a]));
  }
}
