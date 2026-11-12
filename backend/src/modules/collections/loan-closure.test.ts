import { denominationsFor } from '@tgs/domain';
import type { DemandSheetDetail, LoanClosureQuote, ReceiptDetail, Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

describe('early loan closure (G1, BR-040, D-111)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let ddo: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object, headers: Record<string, string> = {}) => app.inject({ method, url: `/api/v1${url}`, headers: { ...bearer(s), ...headers }, ...(payload ? { payload } : {}) });

  // A loan on a draft (GENERATED) sheet whose earlier instalments are all paid, and one on a sheet with the DDO.
  const unpaidBefore = (memberId: string, loanId: string) =>
    data.demandSheets.filter((s) => s.status === 'RECOVERY_POSTED').flatMap((s) => s.lines.filter((l) => l.memberId === memberId)).flatMap((l) => l.components.filter((c) => c.loanId === loanId && (c.head === 'PRINCIPAL' || c.head === 'INTEREST'))).some((c) => c.allocated < c.amount);
  const onSheet = (status: string) => {
    for (const s of data.demandSheets.filter((x) => x.status === status))
      for (const l of s.lines) {
        const c = l.components.find((x) => x.head === 'PRINCIPAL' && x.loanId);
        if (c && !unpaidBefore(l.memberId, c.loanId!) && data.loans.find((x) => x.id === c.loanId)?.status === 'ACTIVE') return { sheet: s, memberId: l.memberId, loanId: c.loanId! };
      }
    throw new Error(`no loan on a ${status} sheet`);
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier, ddo] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(() => app.close());

  it('refuses while the instalment is with the DDO', async () => {
    const { loanId } = onSheet('SENT_TO_DDO');
    const q = (await call('GET', `/loans/${loanId}/closure`, cashier)).json() as LoanClosureQuote;
    expect(q.canClose).toBe(false);
    expect(q.blockers.join(' ')).toMatch(/with the DDO/);
    const res = await call('POST', `/loans/${loanId}/closure`, cashier, { mode: 'BANK_TRANSFER', amount: q.total, reference: 'UTR123456' });
    expect(res.json()).toMatchObject({ code: 'RULE_VIOLATION', ruleId: 'BR-040' });
  });

  it('closes a loan: receipt, balanced ledger entry, loan closed, draft demand without it', async () => {
    const { sheet, memberId, loanId } = onSheet('GENERATED');
    const q = (await call('GET', `/loans/${loanId}/closure`, cashier)).json() as LoanClosureQuote;
    expect(q).toMatchObject({ canClose: true, memberId, draftCycles: [sheet.cycle] });
    expect(q.total).toBe(q.principal + q.interest);
    expect(q.principal).toBeGreaterThan(0);

    expect((await call('POST', `/loans/${loanId}/closure`, ddo, { mode: 'BANK_TRANSFER', amount: q.total, reference: 'UTR123456' })).statusCode).toBe(403);
    expect((await call('POST', `/loans/${loanId}/closure`, cashier, { mode: 'CASH', amount: q.total - 100, denominations: denominationsFor(q.total - 100) })).json().fieldErrors).toHaveProperty('amount');
    expect((await call('POST', `/loans/${loanId}/closure`, cashier, { mode: 'BANK_TRANSFER', amount: q.total })).json().fieldErrors).toHaveProperty('reference');

    const tbBefore = (await call('GET', '/ledger/trial-balance', accountant)).json();
    const key = { 'idempotency-key': 'close-test-0001' };
    const cash = { mode: 'CASH', amount: q.total, denominations: denominationsFor(q.total), coins: q.total % 1000 };
    expect((await call('POST', `/loans/${loanId}/closure`, cashier, { ...cash, coins: 1000 })).json().fieldErrors).toHaveProperty('coins');
    const res = await call('POST', `/loans/${loanId}/closure`, cashier, cash, key);
    expect(res.statusCode).toBe(201);
    const r = res.json() as ReceiptDetail;
    expect(r.receipt).toMatchObject({ purpose: 'LOAN_CLOSURE', amount: q.total, memberId });
    // A retry with the same key gives the same receipt back, not a second one.
    const again = await call('POST', `/loans/${loanId}/closure`, cashier, cash, key);
    expect(again.json().receipt.receiptNo).toBe(r.receipt.receiptNo);

    const loan = (await call('GET', `/loans/${loanId}`, accountant)).json().loan;
    expect(loan).toMatchObject({ status: 'CLOSED', outstandingPrincipal: 0 });
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    // Cash up by the total, the loan down by its principal: the books grow by the interest earned.
    expect(tb.totalDebit).toBe(tbBefore.totalDebit + q.interest);

    const after = (await call('GET', `/demand/sheets/${sheet.id}`, accountant)).json() as DemandSheetDetail;
    const line = after.lines.find((l) => l.memberId === memberId)!;
    expect(line.components.some((c) => c.loanId === loanId)).toBe(false);
    expect(after.totals.demand).toBe(after.lines.reduce((s, l) => s + l.totalDemand, 0));

    expect((await call('GET', `/loans/${loanId}/closure`, cashier)).json().canClose).toBe(false);
  });
});
