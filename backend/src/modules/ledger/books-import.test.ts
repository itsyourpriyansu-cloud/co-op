import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { importDepositRegister } from '../deposits/register-import';
import { importLoanRegister } from '../loans/register-import';
import { importMemberRegister } from '../members/register-import';
import { importOpeningBalances, reconcileOpening } from './opening-import';

// G6 exit test (docs/24): a fictional register imports and the trial balance balances after it.
describe('go-live data import: deposits, loans, opening balances, reconciliation (G6)', () => {
  let app: FastifyInstance;
  const file = (n: string) => readFileSync(new URL(`../../../import/${n}`, import.meta.url), 'utf8');
  const asOn = '2026-10-24';
  const opts = (commit: boolean) => ({ commit, asOn, actor: { id: 'system-import', name: 'Register import' } });
  const tbCsv = async () => 'accountCode,debit,credit\n' + (await app.ledger.trialBalance(asOn)).rows.filter((r) => r.code !== '3900').map((r) => `${r.code},${r.debitBalance / 100},${r.creditBalance / 100}`).join('\n');

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    expect((await importMemberRegister(app, file('members-register-sample.csv'), opts(true))).committed).toBe(true);
  });
  afterAll(() => app.close());

  it('deposits: rows are checked, then FD, CRD and SRDS come in with balanced opening entries', async () => {
    const bad = file('deposits-register-sample.csv').replace('9001,CRD', '9999,CRD').replace('OLD/FD/0457,2025-08-01', 'FD-00001,2025-08-01');
    const r = await importDepositRegister(app, bad, opts(true));
    expect(r.committed).toBe(false);
    expect(r.errors.map((e) => Object.keys(e.fieldErrors))).toEqual([['generalNo'], ['fdrNo']]);

    const done = await importDepositRegister(app, file('deposits-register-sample.csv'), opts(true));
    expect(done).toMatchObject({ committed: true, errors: [], totals: { FD: 100_000_00, CRD: 12_000_00, SRDS: 8_400_50 } });
    const fd = (await app.deposits.repo.forMember('mem-9002')).find((d) => d.scheme === 'FD');
    expect(fd).toMatchObject({ fdrNo: 'OLD/FD/0457', status: 'ACTIVE', maturityDate: '2027-08-01', payoutFrequency: 'QUARTERLY', balance: 100_000_00 });
    expect((await importDepositRegister(app, file('deposits-register-sample.csv'), opts(false))).errors).toHaveLength(3);
  });

  it('loans: sureties, pledged FD and EMI are checked; running loans come in with a schedule for what is left', async () => {
    const seeded = (await app.members.repo.others()).filter((m) => m.status === 'ACTIVE' && !m.generalNo.startsWith('900')).slice(0, 2);
    const ordinary = `\n9001,OL/2024/055,ORDINARY,House repair,200000,100,11,2024-05-01,150000,75,,${seeded.map((m) => m.generalNo).join(';')},`;
    const wrongEmi = file('loans-register-sample.csv').replace('2025-12-05,45000,18,,', '2025-12-05,45000,18,1,') + '\n9002,OL/2024/056,ORDINARY,x,100000,50,11,2024-05-01,50000,25,,9001,';
    const r = await importLoanRegister(app, wrongEmi, opts(true));
    expect(r.committed).toBe(false);
    expect(r.errors.map((e) => Object.keys(e.fieldErrors))).toEqual([['emi'], ['suretyGeneralNos']]);

    const done = await importLoanRegister(app, file('loans-register-sample.csv').trimEnd() + ordinary, opts(true));
    expect(done).toMatchObject({ committed: true, errors: [], totals: { outstanding: 265_000_00 } });
    const loans = await app.loans.repo.forMember('mem-9001');
    const salary = loans.find((l) => l.loanNo === 'OL/2025/118')!;
    expect(salary).toMatchObject({ status: 'ACTIVE', outstandingPrincipal: 45_000_00 });
    expect(salary.schedule).toHaveLength(18);
    expect(salary.schedule[0]).toMatchObject({ dueCycle: '2026-11', opening: 45_000_00 });
    expect(salary.schedule.at(-1)!.closing).toBe(0);
    const ord = loans.find((l) => l.loanNo === 'OL/2024/055')!;
    expect(ord.sureties.map((s) => s.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
    const lad = (await app.loans.repo.forMember('mem-9002')).find((l) => l.product === 'DEPOSIT')!;
    expect((await app.deposits.repo.find(lad.pledgedDepositId!))?.pledgedToLoanId).toBe(lad.id);
  });

  it('opening balances post once against 3900; the reconciliation then agrees with the old books', async () => {
    expect((await importOpeningBalances(app, 'accountCode,debit,credit\n1300,10,\n3900,1,', opts(true))).errors.map((e) => e.fieldErrors.accountCode)).toEqual([expect.stringMatching(/per member/), expect.stringMatching(/worked out/)]);

    // Make the general heads carry exactly what the member heads put on 3900, as a real trial balance would.
    const before = (await reconcileOpening(app, 'accountCode,debit,credit\n1100,0,', asOn)).openingDifference;
    const bank = before - 25000_00 + 150000_00;
    const csv = `accountCode,debit,credit\n1100,25000,\n1200,${bank >= 0 ? `${bank / 100},` : `,${-bank / 100}`}\n2320,,150000\n`;
    const r = await importOpeningBalances(app, csv, opts(true));
    expect(r).toMatchObject({ committed: true, errors: [] });
    expect((await importOpeningBalances(app, csv, opts(false))).errors[0]!.fieldErrors.file).toMatch(/already in the books/);

    const books = await tbCsv();
    const ok = await reconcileOpening(app, books, asOn);
    expect(ok).toMatchObject({ errors: [], mismatches: 0, openingDifference: 0, balanced: true });

    const off = await reconcileOpening(app, books.replace(/^1100,25000,0$/m, '1100,24000,0'), asOn);
    expect(off.mismatches).toBe(1);
    expect(off.rows.find((x) => x.code === '1100')).toMatchObject({ books: 24_000_00, system: 25_000_00, difference: 1_000_00 });
  });
});
