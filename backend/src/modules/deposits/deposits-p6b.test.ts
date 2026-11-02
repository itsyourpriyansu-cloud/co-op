import type { DepositAccount, FdSettlement, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// P6b (D-086): FD maturity job and premature withdrawal, both driven by Admin settings.
describe('FD maturity and premature withdrawal (P6b)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const settings = (patch: object) => call('PUT', '/settings/values', admin, patch);
  const activeFds = data.deposits.filter((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && !d.pledgedToLoanId && d.payoutFrequency === 'ON_MATURITY');
  const entries = async (source: string) => (await call('GET', `/ledger/journals?source=${source}&pageSize=100`, accountant)).json().items as Array<{ id: string; sourceRef: string }>;
  const lines = async (id: string) => (await call('GET', `/ledger/journals/${id}`, accountant)).json().lines as Array<{ accountCode: string; debit: number; credit: number }>;
  const balanced = async () => {
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant')]);
  });
  afterAll(() => app.close());

  it('Admin configures the FD settings; others cannot; the values outlive a restart', async () => {
    const before = (await call('GET', '/settings', admin)).json().settings;
    expect(before).toMatchObject({ fdMaturityJobEnabled: true, fdPrematureWithdrawalEnabled: true, fdPrematurePenaltyMethod: 'RATE_CUT', fdPrematurePenaltyPercent: 0 });
    expect((await call('PUT', '/settings/values', accountant, { fdPrematurePenaltyPercent: 1 })).statusCode).toBe(403);
    expect((await settings({ fdPrematurePenaltyPercent: -2, fdMaturityRunHour: 30 })).json().fieldErrors).toMatchObject({ fdPrematurePenaltyPercent: expect.any(String), fdMaturityRunHour: expect.any(String) });
    const saved = (await settings({ fdMaturityRunHour: 2, fdPrematurePenaltyMethod: 'SHARE_OF_INTEREST', fdPrematurePenaltyPercent: 10 })).json().settings;
    expect(saved).toMatchObject({ fdMaturityRunHour: 2, fdPrematurePenaltyMethod: 'SHARE_OF_INTEREST', fdPrematurePenaltyPercent: 10 });
    // A fresh app instance (a restart) reads the same values from the database.
    const again = await buildTestApp();
    expect((await again.masters.settings()).fdPrematurePenaltyPercent).toBe(10);
    await again.close();
    await settings({ fdMaturityRunHour: 1, fdPrematurePenaltyMethod: 'RATE_CUT', fdPrematurePenaltyPercent: 0 });
  });

  it('the maturity job matures due FDs once and books their interest', async () => {
    const fd = activeFds[0]!;
    await app.db.execute(sql`update deposits set maturity_date = '2026-01-15', data = jsonb_set(data, '{maturityDate}', '"2026-01-15"') where id = ${fd.id}`);
    expect((await call('POST', '/deposits/maturity/run', accountant)).statusCode).toBe(403);
    const first = (await call('POST', '/deposits/maturity/run', admin)).json();
    expect(first.matured).toBeGreaterThanOrEqual(1);
    const matured = (await call('GET', `/deposits/${fd.id}`, admin)).json().deposit as DepositAccount;
    const interest = (fd.maturityValue ?? 0) - (fd.principal ?? 0);
    expect(matured).toMatchObject({ status: 'MATURED', maturityInterestAccrued: interest });
    const booked = (await entries('FD_MATURITY')).filter((e) => e.sourceRef === (fd.fdrNo ?? fd.accountNo));
    expect(booked).toHaveLength(1);
    expect(await lines(booked[0]!.id)).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2210', credit: interest })]));

    // Idempotent: a second run changes nothing and books nothing.
    const count = (await entries('FD_MATURITY')).length;
    expect((await call('POST', '/deposits/maturity/run', admin)).json().matured).toBe(0);
    expect((await entries('FD_MATURITY')).length).toBe(count);

    // Payout pays the booked interest from "interest payable", not as a second expense.
    const cashier = await signInAs(app, 'stf-cashier');
    expect((await call('POST', `/deposits/${fd.id}/actions/payout`, cashier, {})).json().deposit.status).toBe('CLOSED');
    const payout = (await entries('FD_PAYOUT'))[0]!;
    const pl = await lines(payout.id);
    expect(pl).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '2210', debit: interest })]));
    expect(pl.some((l) => l.accountCode === '5100')).toBe(false);

    await settings({ fdMaturityJobEnabled: false });
    expect((await call('POST', '/deposits/maturity/run', admin)).json().code).toBe('RULE_VIOLATION');
    await settings({ fdMaturityJobEnabled: true });
    await balanced();
  });

  it('withdrawal at 0% pays the principal and all interest earned', async () => {
    const fd = activeFds[1]!;
    const preview = (await call('GET', `/deposits/${fd.id}/withdrawal-preview`, admin)).json() as FdSettlement;
    expect(preview).toMatchObject({ principal: fd.principal, penaltyPercent: 0, penalty: 0, payable: fd.principal! + preview.interestEarned });
    expect((await call('GET', `/deposits/${fd.id}`, admin)).json().actions).toContain('withdraw');
    const done = (await call('POST', `/deposits/${fd.id}/actions/withdraw`, admin, { remarks: 'Member needs the money' })).json().deposit as DepositAccount;
    expect(done).toMatchObject({ status: 'CLOSED', balance: 0, prematureWithdrawal: { payable: preview.payable, penalty: 0 } });
    const e = (await entries('FD_PREMATURE')).find((x) => x.sourceRef === (fd.fdrNo ?? fd.accountNo))!;
    const l = await lines(e.id);
    expect(l.some((x) => x.accountCode === '4400')).toBe(false);
    expect(l).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '1200', credit: preview.payable }), expect.objectContaining({ accountCode: '2200', debit: fd.principal })]));
    // No second withdrawal.
    expect((await call('POST', `/deposits/${fd.id}/actions/withdraw`, admin, {})).json().code).toBe('INVALID_TRANSITION');
  });

  it('withdrawal with a penalty (rate cut) records the penalty as income; settings do not touch past withdrawals', async () => {
    await settings({ fdPrematurePenaltyMethod: 'RATE_CUT', fdPrematurePenaltyPercent: 1 });
    const fd = activeFds.slice(4).find((d) => d.openedOn <= '2025-10-01')!;
    const preview = (await call('GET', `/deposits/${fd.id}/withdrawal-preview`, admin)).json() as FdSettlement;
    expect(preview.penalty).toBeGreaterThan(0);
    expect(preview.payable).toBe(fd.principal! + preview.interestEarned - preview.penalty);
    const done = (await call('POST', `/deposits/${fd.id}/actions/withdraw`, admin, {})).json().deposit as DepositAccount;
    const e = (await entries('FD_PREMATURE')).find((x) => x.sourceRef === (fd.fdrNo ?? fd.accountNo))!;
    expect(await lines(e.id)).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: '4400', credit: preview.penalty })]));

    await settings({ fdPrematurePenaltyMethod: 'SHARE_OF_INTEREST', fdPrematurePenaltyPercent: 50 });
    const later = (await call('GET', `/deposits/${fd.id}`, admin)).json().deposit as DepositAccount;
    expect(later.prematureWithdrawal).toEqual(done.prematureWithdrawal);
    expect(later.prematureWithdrawal).toMatchObject({ method: 'RATE_CUT', penaltyPercent: 1 });
    await balanced();
  });

  it('refuses when switched off, pledged, or not allowed', async () => {
    const fd = activeFds[3]!;
    expect((await call('GET', `/deposits/${fd.id}/withdrawal-preview`, accountant)).statusCode).toBe(403);
    expect((await call('POST', `/deposits/${fd.id}/actions/withdraw`, accountant, {})).statusCode).toBe(403);
    expect((await call('GET', `/deposits/${fd.id}`, accountant)).json().actions).not.toContain('withdraw');
    await settings({ fdPrematureWithdrawalEnabled: false });
    expect((await call('POST', `/deposits/${fd.id}/actions/withdraw`, admin, {})).json().code).toBe('RULE_VIOLATION');
    expect((await call('GET', `/deposits/${fd.id}`, admin)).json().actions).not.toContain('withdraw');
    await settings({ fdPrematureWithdrawalEnabled: true });
    const pledged = data.deposits.find((d) => d.scheme === 'FD' && d.status === 'ACTIVE' && d.pledgedToLoanId)!;
    expect((await call('POST', `/deposits/${pledged.id}/actions/withdraw`, admin, {})).json().code).toBe('RULE_VIOLATION');
  });
});
