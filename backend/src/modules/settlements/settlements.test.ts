import type { Session, SettlementView } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// F-08 (D-098): a member leaves and is settled; one balanced ledger entry closes loans, deposits and shares.
describe('final settlement (F-08)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const view = async (id: string) => (await call('GET', `/members/${id}/settlement`, accountant)).json() as SettlementView;
  /** An active member with an active loan and some savings. */
  const member = data.members.find((m) => m.status === 'ACTIVE' && data.loans.some((l) => l.memberId === m.id && l.status === 'ACTIVE') && data.deposits.some((d) => d.memberId === m.id && d.status === 'ACTIVE'))!;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('marking a member as retired stops demand and opens the settlement', async () => {
    expect((await view(member.id)).settlement).toBeNull();
    expect((await call('POST', `/members/${member.id}/exit`, cashier, { status: 'RETIRED', date: data.today })).statusCode).toBe(403);
    expect((await call('POST', `/members/${member.id}/exit`, accountant, { status: 'GONE', date: '2999-01-01' })).json().fieldErrors).toMatchObject({ status: expect.any(String), date: expect.any(String) });
    const v = (await call('POST', `/members/${member.id}/exit`, accountant, { status: 'RETIRED', date: data.today })).json() as SettlementView;
    expect(v).toMatchObject({ member: { status: 'RETIRED' }, settlement: { status: 'OPEN', exit: { status: 'RETIRED', date: data.today } }, canPost: true });
    expect(v.statement!.owes.some((o) => o.part === 'PRINCIPAL')).toBe(true);
    expect(v.statement!.net).toBe(v.statement!.totalHeld - v.statement!.totalOwed);
    expect((await call('POST', `/members/${member.id}/exit`, accountant, { status: 'RESIGNED', date: data.today })).json().code).toBe('INVALID_TRANSITION');
  });

  it('posting needs the exact amount from the pay office, then closes everything in one balanced entry', async () => {
    const st = (await view(member.id)).statement!;
    const required = Math.max(0, -st.net);
    expect((await call('POST', `/members/${member.id}/settlement/post`, accountant, { offset: true, received: required + 100, reference: 'CHQ-1' })).statusCode).toBe(400);
    const posted = await call('POST', `/members/${member.id}/settlement/post`, accountant, { offset: true, received: required, reference: 'CHQ-778' });
    expect(posted.statusCode).toBe(200);
    const v = posted.json() as SettlementView;
    expect(v.settlement).toMatchObject({ status: 'POSTED', posted: { received: required, paid: Math.max(0, st.net), payTo: 'MEMBER', reference: 'CHQ-778' } });
    expect(v.settlement!.posted!.journalNo).toMatch(/^JE-/);

    const loans = (await call('GET', `/loans?q=${member.generalNo}&pageSize=100`, accountant)).json().items as Array<{ generalNo: string; status: string }>;
    expect(loans.filter((l) => l.generalNo === member.generalNo && l.status === 'ACTIVE')).toHaveLength(0);
    const dues = (await call('GET', `/members/${member.id}/dues`, accountant)).json();
    expect(dues.totalArrears).toBe(0);
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect((await call('POST', `/members/${member.id}/settlement/post`, accountant, { offset: true, received: 0, reference: 'X' })).json().code).toBe('INVALID_TRANSITION');
  });

  it('after a death, what is held goes to the nominee', async () => {
    const other = data.members.find((m) => m.status === 'ACTIVE' && m.id !== member.id && !data.loans.some((l) => l.memberId === m.id && l.status === 'ACTIVE') && data.deposits.some((d) => d.memberId === m.id && d.status === 'ACTIVE'))!;
    await call('POST', `/members/${other.id}/exit`, accountant, { status: 'DECEASED', date: data.today, remarks: 'Death certificate received' });
    const st = (await view(other.id)).statement!;
    expect(st.net).toBeGreaterThan(0);
    const v = (await call('POST', `/members/${other.id}/settlement/post`, accountant, { offset: true, received: 0, payTo: 'MEMBER', reference: 'NEFT-9' })).json() as SettlementView;
    expect(v.settlement!.posted).toMatchObject({ payTo: 'NOMINEE', payeeName: other.nominee.name, paid: st.net });
    const tb = (await call('GET', '/ledger/trial-balance', accountant)).json();
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });
});
