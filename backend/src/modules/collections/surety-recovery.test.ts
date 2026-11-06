import type { MemberDues, Session, SuretyRecoveryPanel } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// F-13 (D-097): the Accountant recovers an overdue loan from its sureties, in equal shares, by counter or salary.
describe('surety recovery (F-13)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const panel = async (loanId: string) => (await call('GET', `/loans/${loanId}/surety-recovery`, accountant)).json() as SuretyRecoveryPanel;
  const dues = async (memberId: string) => (await call('GET', `/members/${memberId}/dues`, accountant)).json() as MemberDues;
  /** A borrower on the October finance sheet whose loan has two accepted sureties. */
  const sheet = data.demandSheets.find((s) => s.id === 'ds-2026-10-fin')!;
  const pick = sheet.lines
    .map((l) => ({ memberId: l.memberId, loan: data.loans.find((x) => x.id === l.components.find((c) => c.head === 'PRINCIPAL')?.loanId) }))
    .find((x) => x.loan && x.loan.sureties.filter((s) => s.status === 'ACCEPTED').length >= 2)!;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, cashier] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('needs the set number of unpaid months, then splits what is overdue equally between the sureties', async () => {
    expect(pick).toBeDefined();
    await call('POST', `/demand/sheets/${sheet.id}/actions/postRecovery`, accountant, { recovered: { [pick.memberId]: 0 } });
    const before = await panel(pick.loan!.id);
    expect(before).toMatchObject({ threshold: 3, eligible: false });
    await call('PUT', '/settings/values', admin, { suretyRecoveryAfterCycles: 1 });
    const p = await panel(pick.loan!.id);
    expect(p).toMatchObject({ eligible: true, canRaise: true });
    expect(p.overdue).toBeGreaterThan(0);
    expect(p.shares.reduce((s, x) => s + x.share, 0)).toBe(p.overdue);
    expect(Math.max(...p.shares.map((x) => x.share)) - Math.min(...p.shares.map((x) => x.share))).toBeLessThanOrEqual(1);
    expect((await call('POST', `/loans/${pick.loan!.id}/surety-recovery`, cashier)).statusCode).toBe(403);
    const raised = (await call('POST', `/loans/${pick.loan!.id}/surety-recovery`, accountant)).json() as SuretyRecoveryPanel;
    expect(raised.recoveries).toHaveLength(p.shares.length);
    expect(raised).toMatchObject({ eligible: false, reason: 'Already being recovered from the sureties.' });
    const first = await dues(p.shares[0]!.memberId);
    expect(first.suretyRecoveries?.[0]).toMatchObject({ loanId: pick.loan!.id, share: p.shares[0]!.share, due: p.shares[0]!.share });
  });

  it("a surety pays at the counter: the borrower's loan arrears go down and the books balance", async () => {
    const p = await panel(pick.loan!.id);
    const r = p.recoveries[0]!;
    const borrowerBefore = await dues(pick.memberId);
    const tooMuch = await call('POST', '/receipts', cashier, { memberId: r.suretyId, purpose: 'SURETY_RECOVERY', recoveryId: r.id, mode: 'BANK_TRANSFER', amount: r.due + 1, date: data.today, reference: 'UTR-SR-0' });
    expect(tooMuch.statusCode).toBe(400);
    const res = await call('POST', '/receipts', cashier, { memberId: r.suretyId, purpose: 'SURETY_RECOVERY', recoveryId: r.id, mode: 'BANK_TRANSFER', amount: 1000, date: data.today, reference: 'UTR-SR-1' });
    expect(res.statusCode).toBe(201);
    expect(res.json().receipt).toMatchObject({ memberId: r.suretyId, purpose: 'SURETY_RECOVERY', allocations: [{ head: 'SURETY', loanId: pick.loan!.id, amount: 1000 }] });
    const borrowerAfter = await dues(pick.memberId);
    expect(borrowerBefore.totalArrears - borrowerBefore.totalPenal - (borrowerAfter.totalArrears - borrowerAfter.totalPenal)).toBe(1000);
    expect((await panel(pick.loan!.id)).recoveries.find((x) => x.id === r.id)).toMatchObject({ paid: 1000, status: 'OPEN' });
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("the other surety's share goes on their next demand once, and a salary deduction pays the borrower's loan", async () => {
    const r = (await panel(pick.loan!.id)).recoveries[1]!;
    const surety = data.members.find((m) => m.id === r.suretyId)!;
    const id = `ds-2026-11-${data.departments.find((d) => d.id === surety.departmentId)!.code.toLowerCase()}`;
    expect((await call('POST', '/demand/generate', accountant, { cycle: '2026-11', departmentIds: [surety.departmentId] })).statusCode).toBe(200);
    const nov = (await call('GET', `/demand/sheets/${id}`, accountant)).json();
    const line = nov.lines.find((l: { memberId: string }) => l.memberId === r.suretyId);
    expect(line.components.find((c: { head: string }) => c.head === 'SURETY')).toMatchObject({ loanId: pick.loan!.id, amount: r.due });
    for (const action of ['certify', 'sendToDdo']) await call('POST', `/demand/sheets/${id}/actions/${action}`, accountant, {});
    const posted = await call('POST', `/demand/sheets/${id}/actions/postRecovery`, accountant, {});
    expect(posted.statusCode).toBe(200);
    expect((await panel(pick.loan!.id)).recoveries.find((x) => x.id === r.id)).toMatchObject({ paid: r.due, status: 'CLOSED', demandedCycle: '2026-11' });
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    await call('PUT', '/settings/values', admin, { suretyRecoveryAfterCycles: 3 });
  });
});
