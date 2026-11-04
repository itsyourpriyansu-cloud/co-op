import type { MemberDues, MemberNotices, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { withTransaction } from '../../db/transaction';
import { demoDataset } from '../../db/seed/dataset';

// P7b-3 (D-088, BR-020, Q-310): defaulter after the set number of unpaid loan cycles (1 by default);
// notices to the borrower and every surety; guarantors are not charged (F-13).
describe('defaulters and notices (P7b-3)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const notices = async (memberId: string) => (await call('GET', `/members/${memberId}/notices`, accountant)).json() as MemberNotices;
  /** A borrower on a sheet whose loan has accepted sureties. */
  const pick = (sheetId: string) => {
    const sheet = data.demandSheets.find((s) => s.id === sheetId)!;
    for (const l of sheet.lines) {
      const loanId = l.components.find((c) => c.head === 'PRINCIPAL')?.loanId;
      const loan = data.loans.find((x) => x.id === loanId);
      const sureties = loan?.sureties.filter((s) => s.status === 'ACCEPTED').map((s) => s.memberId) ?? [];
      if (loan && sureties.length) return { memberId: l.memberId, loan, sureties };
    }
    throw new Error('no borrower with sureties');
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant')]);
  });
  afterAll(() => app.close());

  it('one unpaid month makes a defaulter; the borrower and every surety get a notice, once', async () => {
    expect((await app.masters.settings()).defaulterCycles).toBe(1);
    const { memberId, loan, sureties } = pick('ds-2026-10-fin');
    // The audit log is not reset between test files: count only what this posting adds.
    const auditBefore = (await app.db.execute(sql`select summary from audit_log where action = 'defaulterNotices' and entity_id = 'ds-2026-10-fin'`)).rows.length;
    const suretyDuesBefore = (await call('GET', `/members/${sureties[0]}/dues`, accountant)).json() as MemberDues;
    const posted = await call('POST', '/demand/sheets/ds-2026-10-fin/actions/postRecovery', accountant, { recovered: { [memberId]: 0 } });
    expect(posted.statusCode).toBe(200);

    const mine = await notices(memberId);
    expect(mine.defaulter).toMatchObject({ isDefaulter: true, threshold: 1 });
    const own = mine.notices.find((n) => n.kind === 'DEFAULTER' && n.loanId === loan.id)!;
    expect(own).toMatchObject({ cycle: '2026-10', borrowerId: memberId, loanNo: loan.loanNo, delivery: { inApp: 'SENT', via: { SMS: 'SIMULATED' } } });
    expect(own.overdue).toBeGreaterThan(0);
    for (const s of sureties) {
      const theirs = await notices(s);
      expect(theirs.notices.find((n) => n.kind === 'GUARANTOR' && n.borrowerId === memberId)).toMatchObject({ loanId: loan.id, cycle: '2026-10' });
    }
    // Guarantors are not charged until the society confirms how (F-13).
    expect((await call('GET', `/members/${sureties[0]}/dues`, accountant)).json().totalArrears).toBe(suretyDuesBefore.totalArrears);

    // At most one notice per recipient, loan and cycle.
    const again = await withTransaction(app.db, (tx) => app.collections.repo.insertNotice(tx, { ...own, id: 'ntc-dup' }));
    expect(again).toBe(false);
    expect((await notices(memberId)).notices.filter((n) => n.kind === 'DEFAULTER' && n.loanId === loan.id)).toHaveLength(1);

    // Recorded in the audit trail.
    const audit = await app.db.execute(sql`select summary from audit_log where action = 'defaulterNotices' and entity_id = 'ds-2026-10-fin'`);
    expect(audit.rows.length).toBe(auditBefore + 1);
  });

  it('the threshold is an Admin setting: with 3 cycles, one short month raises no notice', async () => {
    await call('PUT', '/settings/values', admin, { defaulterCycles: 3 });
    const { memberId } = pick('ds-2026-10-gad');
    await call('POST', '/demand/sheets/ds-2026-10-gad/actions/postRecovery', accountant, { recovered: { [memberId]: 0 } });
    const n = await notices(memberId);
    expect(n.defaulter.threshold).toBe(3);
    expect(n.notices.filter((x) => x.cycle === '2026-10')).toHaveLength(0);
    await call('PUT', '/settings/values', admin, { defaulterCycles: 1 });
  });

  it('only staff who can view members see notices', async () => {
    const member = await signInAs(app, 'mem-1103');
    expect((await call('GET', '/members/mem-1103/notices', member)).statusCode).toBe(403);
  });
});
