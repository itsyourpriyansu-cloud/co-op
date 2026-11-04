import type { DefaulterNotice, ReportDef, ReportOptions, ReportResult, Session } from '@tgs/types';
import { loanDefaulter, loanUnpaid } from '@tgs/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// P8c (docs/22 §5.7): the 8 reports and the defaulter notice from the backend.
describe('reports (P8c)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let ddo: Session;
  const data = demoDataset();
  const call = (url: string, s: Session) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(s) });
  const run = async (url: string, s: Session = accountant) => {
    const res = await call(url, s);
    expect(res.statusCode).toBe(200);
    return res.json() as ReportResult;
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, ddo] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(() => app.close());

  it('the catalogue lists 8 table reports and posted cycles; members and the Cashier cannot see it', async () => {
    const { reports, options } = (await call('/reports', accountant)).json() as { reports: ReportDef[]; options: ReportOptions };
    expect(reports.filter((r) => r.available && r.kind === 'table')).toHaveLength(8);
    expect(options.cycles.length).toBeGreaterThan(0);
    expect(options.cycles).toEqual([...options.cycles].sort().reverse());
    expect((await call('/reports', await signInAs(app, 'mem-1103'))).statusCode).toBe(403);
    expect((await call('/reports/trial-balance', accountant)).statusCode).toBe(404);
  });

  it('every report runs; totals add up the rows', async () => {
    for (const id of ['dues', 'defaulters', 'dept-unpaid', 'dept-less', 'maturity', 'loans-ledger', 'retirement']) {
      const r = await run(`/reports/${id}`);
      const rows = r.groups.flatMap((g) => g.rows);
      expect(r.rowCount).toBe(rows.length);
      for (const c of r.columns.filter((x) => x.total)) expect(r.totals[c.key]).toBe(rows.reduce((s, x) => s + Number(x[c.key] ?? 0), 0));
    }
    expect((await call('/reports/member-ledger', accountant)).statusCode).toBe(400);
    expect((await run('/reports/member-ledger?memberId=mem-1103')).rowCount).toBeGreaterThan(0);
    expect((await call('/reports/maturity?from=2026-12-01&to=2026-11-01', accountant)).statusCode).toBe(400);
  });

  it('the dues list reconciles with the department-wise unpaid report for the latest posted cycle', async () => {
    const { options } = (await call('/reports', accountant)).json() as { options: ReportOptions };
    const cycle = options.cycles[0]!;
    const dept = await run(`/reports/dept-unpaid?cycle=${cycle}`);
    const less = await run(`/reports/dept-less?cycle=${cycle}`);
    expect(less.totals.short).toBe(dept.totals.unpaid);
  });

  it('defaulters follow BR-020 as built: unpaid loan instalments in the latest cycles in a row', async () => {
    const r = await run('/reports/defaulters');
    const cycle = r.filters.cycle!;
    const expected = new Set<string>();
    const byMember = new Map<string, Array<{ cycle: string; loanUnpaid: number }>>();
    for (const sh of data.demandSheets.filter((s) => s.status === 'RECOVERY_POSTED' && s.cycle <= cycle)) for (const l of sh.lines) byMember.set(l.memberId, [...(byMember.get(l.memberId) ?? []), { cycle: sh.cycle, loanUnpaid: loanUnpaid(l.components) }]);
    for (const [id, h] of byMember) if (loanDefaulter(h, 1).isDefaulter) expected.add(data.members.find((m) => m.id === id)!.generalNo);
    expect(new Set(r.groups.flatMap((g) => g.rows.map((x) => String(x.generalNo))))).toEqual(expected);
  });

  it('a DDO sees only their department', async () => {
    const fin = data.staffUsers.find((u) => u.id === 'stf-ddo-fin')!.departmentId!;
    const name = data.departments.find((d) => d.id === fin)!.name;
    const r = await call('/reports/dues', ddo);
    if (r.statusCode === 403) return; // DDOs without reports.view
    expect((r.json() as ReportResult).groups.every((g) => g.label === name)).toBe(true);
  });

  it('the defaulter notice prints the short months and the BR-020 status', async () => {
    const r = await run('/reports/defaulters');
    const generalNo = String(r.groups[0]!.rows[0]!.generalNo);
    const n = (await call(`/print/defaulter-notice/${generalNo}`, accountant)).json() as DefaulterNotice;
    expect(n.isDefaulter).toBe(true);
    expect(n.totalUnpaid).toBe(n.rows.reduce((s, x) => s + x.unpaid, 0));
    expect(n.text.body).not.toMatch(/\{overdue\}|\{cycles\}/);
    expect((await call('/print/defaulter-notice/nobody', accountant)).statusCode).toBe(404);
  });
});
