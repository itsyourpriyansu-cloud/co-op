import type { DemandSheetDetail, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { withTransaction } from '../../db/transaction';

// D-146: the instalment that pays a loan off closes it and tells the member (app, WhatsApp, email).
describe('loan repaid by its last instalment (D-146)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  const FIN = 'ds-2026-10-fin';
  const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(accountant), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    accountant = await signInAs(app, 'stf-accountant');
  });
  afterAll(() => app.close());

  it('posting the final deduction closes the loan and sends "Loan repaid" once', async () => {
    const sheet = (await call('GET', `/demand/sheets/${FIN}`)).json() as DemandSheetDetail;
    // A member whose active loan has an instalment on this sheet.
    let pick: { memberId: string; loanId: string; principal: number; demand: number } | undefined;
    for (const l of sheet.lines) {
      const c = l.components.find((x) => x.head === 'PRINCIPAL' && x.loanId);
      const loan = c && (await app.loans.repo.find(c.loanId!));
      if (c && loan?.status === 'ACTIVE' && loan.schedule.some((r) => r.dueCycle === sheet.sheet.cycle)) {
        pick = { memberId: l.memberId, loanId: loan.id, principal: c.amount, demand: l.totalDemand };
        break;
      }
    }
    expect(pick).toBeDefined();
    const { memberId, loanId, principal, demand } = pick!;

    // Arrange: every other instalment already paid, and only this month's principal left.
    const loan = (await app.loans.repo.find(loanId))!;
    await withTransaction(app.db, (tx) => app.loans.repo.save(tx, { ...loan, outstandingPrincipal: principal, schedule: loan.schedule.map((r) => (r.dueCycle === sheet.sheet.cycle ? r : { ...r, paidStatus: 'PAID' as const })) }));

    const posted = await call('POST', `/demand/sheets/${FIN}/actions/postRecovery`, { recovered: { [memberId]: demand } });
    expect(posted.statusCode).toBe(200);
    expect((await call('GET', `/loans/${loanId}`)).json().loan).toMatchObject({ status: 'CLOSED', outstandingPrincipal: 0 });

    const sent = (await app.db.execute<{ link: string; via: Record<string, string> }>(sql`select link, via from notifications where recipient_id = ${memberId} and template_key = 'loan.repaid'`)).rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ link: `/loan/${loanId}`, via: { WHATSAPP: 'SIMULATED' } });
  });
});
