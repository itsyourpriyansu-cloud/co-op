import type { Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('ledger (P3 exit test, REQ-131)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let secretary: Session;
  const lakshmi = demoDataset().members.find((m) => m.generalNo === '1101')!;
  const get = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
  const post = (url: string, s: Session, payload: object) => app.inject({ method: 'POST', url: `/api/v1${url}`, headers: bearer(s), payload });
  const transfer = (amount: number) => ({
    narration: 'Cash deposited into the bank',
    lines: [
      { accountCode: '1200', debit: amount, credit: 0 },
      { accountCode: '1100', debit: 0, credit: amount },
    ],
  });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, secretary] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-secretary')]);
  });
  afterAll(() => app.close());

  it('shows the chart of accounts to staff who read the books, not to a DDO', async () => {
    const res = await get('/ledger/accounts', secretary);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toContainEqual(expect.objectContaining({ code: '1300', name: 'Ordinary loans', type: 'ASSET', normalSide: 'DEBIT', memberLevel: true }));
    const ddo = await signInAs(app, 'stf-ddo-fin');
    expect((await get('/ledger/accounts', ddo)).statusCode).toBe(403);
  });

  it('the opening balances make a trial balance whose two sides agree', async () => {
    const tb = (await get('/ledger/trial-balance', accountant)).json();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const capital = tb.rows.find((r: { code: string }) => r.code === '3100');
    expect(capital.balance).toBe(demoDataset().shareAccounts.reduce((s, a) => s + a.shareCapital, 0));
    expect((await get('/ledger/trial-balance?asOf=2000-01-01', accountant)).json().rows).toEqual([]);
  });

  it("a member's statement matches their shares and loans", async () => {
    const st = (await get(`/ledger/members/${lakshmi.id}/statement`, secretary)).json();
    const share = demoDataset().shareAccounts.find((s) => s.memberId === lakshmi.id)!;
    expect(st.balances.find((b: { accountCode: string }) => b.accountCode === '3100').balance).toBe(share.shareCapital);
    const loans = demoDataset().loans.filter((l) => l.memberId === lakshmi.id && l.status === 'ACTIVE');
    const ordinary = loans.filter((l) => l.product === 'ORDINARY').reduce((s, l) => s + l.outstandingPrincipal, 0);
    if (ordinary) expect(st.balances.find((b: { accountCode: string }) => b.accountCode === '1300').balance).toBe(ordinary);
    expect(st.lines.every((l: { entryNo: string }) => /^JE-\d{6}$/.test(l.entryNo))).toBe(true);
  });

  it('posts a balanced manual journal and refuses bad ones with the reason', async () => {
    const ok = await post('/ledger/journals', accountant, transfer(500000));
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ source: 'MANUAL', total: 500000, postedBy: 'Suresh Goud', lines: [{ accountCode: '1200', debit: 500000 }, { accountCode: '1100', credit: 500000 }] });

    const unbalanced = await post('/ledger/journals', accountant, { narration: 'Does not balance', lines: [{ accountCode: '1200', debit: 100 }, { accountCode: '1100', credit: 90 }] });
    expect(unbalanced.statusCode).toBe(400);
    expect(unbalanced.json().fieldErrors.lines).toMatch(/must be equal/);

    const noMember = await post('/ledger/journals', accountant, { narration: 'Loan without member', lines: [{ accountCode: '1300', debit: 100 }, { accountCode: '1200', credit: 100 }] });
    expect(noMember.json().fieldErrors['lines.0']).toMatch(/needs the member/);

    const unknown = await post('/ledger/journals', accountant, { narration: 'Unknown account', lines: [{ accountCode: '9999', debit: 100 }, { accountCode: '1200', credit: 100 }] });
    expect(unknown.json().fieldErrors['lines.0']).toMatch(/Unknown account/);

    const future = await post('/ledger/journals', accountant, { ...transfer(100), entryDate: '2999-01-01' });
    expect(future.json().fieldErrors.entryDate).toBeTruthy();

    expect((await post('/ledger/journals', secretary, transfer(100))).statusCode).toBe(403);
  });

  it('a reversal posts the mirror image once, and the books still balance', async () => {
    const original = (await post('/ledger/journals', accountant, transfer(70000))).json();
    const rev = await post(`/ledger/journals/${original.id}/reverse`, accountant, { reason: 'Posted twice by mistake' });
    expect(rev.statusCode).toBe(200);
    expect(rev.json()).toMatchObject({ source: 'REVERSAL', reversesEntryId: original.id, lines: [{ accountCode: '1200', credit: 70000 }, { accountCode: '1100', debit: 70000 }] });
    expect((await get(`/ledger/journals/${original.id}`, accountant)).json().reversedBy.entryNo).toBe(rev.json().entryNo);

    expect((await post(`/ledger/journals/${original.id}/reverse`, accountant, { reason: 'Second try' })).statusCode).toBe(409);
    expect((await post(`/ledger/journals/${rev.json().id}/reverse`, accountant, { reason: 'Reverse the reversal' })).statusCode).toBe(409);
    expect((await get('/ledger/trial-balance', accountant)).json().balanced).toBe(true);
  });

  it('an account ledger ends on the trial-balance figure', async () => {
    const gl = (await get('/ledger/accounts/1200/lines', accountant)).json();
    const tb = (await get('/ledger/trial-balance', accountant)).json();
    expect(gl.closingBalance).toBe(tb.rows.find((r: { code: string }) => r.code === '1200').balance);
    expect(gl.lines.at(-1).balance).toBe(gl.closingBalance);
  });

  it('lists journals newest first and filters by source', async () => {
    const page = (await get('/ledger/journals?source=MANUAL&pageSize=5', accountant)).json();
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.items.every((e: { source: string }) => e.source === 'MANUAL')).toBe(true);
  });

  it('the database itself refuses unbalanced entries and any edit or delete', async () => {
    // Drizzle wraps the database error; PostgreSQL's own message is the cause.
    const dbError = async (work: Promise<unknown>) => {
      const err = (await work.then(() => undefined, (e: Error & { cause?: Error }) => e)) as (Error & { cause?: Error }) | undefined;
      return `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
    };
    expect(await dbError(app.db.execute(sql`update journal_lines set debit = debit`))).toMatch(/append-only/);
    expect(await dbError(app.db.execute(sql`delete from journal_entries`))).toMatch(/append-only/);
    const oneLine = app.db.transaction(async (tx) => {
      const [e] = await tx.execute<{ id: string }>(sql`insert into journal_entries (entry_date, narration, source, total, posted_by, posted_by_name) values ('2026-10-30', 'one line', 'MANUAL', 5, 'x', 'x') returning id`).then((r) => r.rows);
      await tx.execute(sql`insert into journal_lines (entry_id, line_no, account_code, debit, credit) values (${e!.id}, 1, '1100', 5, 0)`);
    });
    expect(await dbError(oneLine)).toMatch(/at least two lines/);
  });

  it('other modules post through the service inside their own transaction', async () => {
    const before = (await get('/ledger/trial-balance', accountant)).json().totalDebit;
    await app.db.transaction(async (tx) => {
      await app.ledger.post({ entryDate: '2026-10-30', narration: 'Admission fee received', source: 'RECEIPT', sourceRef: 'R-TEST', postedBy: { id: 'stf-cashier', name: 'Venkat Naidu' }, lines: [{ accountCode: '1100', debit: 10000, credit: 0 }, { accountCode: '4300', debit: 0, credit: 10000 }] }, tx);
    });
    const tb = (await get('/ledger/trial-balance', accountant)).json();
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r: { code: string }) => r.code === '4300').balance).toBe(10000);
    expect(tb.totalDebit).toBeGreaterThanOrEqual(before);
  });
});
