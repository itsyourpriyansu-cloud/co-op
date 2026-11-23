import { ALL_DEPARTMENTS, type DemandCycleOverview, type DemandPreview, type DemandSheetDetail, type Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';

// D-147: with one DDO for all departments, the month's demand is one sheet; the Accountant still sees it per department.
describe('one demand sheet for all departments (D-147)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let ddo: Session;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const cycle = '2026-11';
  const id = `ds-${cycle}-all`;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, ddo] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-ddo-fin')]);
    expect((await call('PUT', '/settings/values', admin, { ddoMode: 'SINGLE', singleDdoUserId: 'stf-ddo-fin' })).statusCode).toBe(200);
  });
  afterAll(() => app.close());

  it('Generate makes one sheet holding every department, even if departments were picked', async () => {
    const preview = (await call('GET', `/demand/preview?cycle=${cycle}`, accountant)).json() as DemandPreview;
    expect(preview.singleSheet).toBe(true);
    const res = await call('POST', '/demand/generate', accountant, { cycle, departmentIds: ['dept-fin'] });
    expect(res.json().generated).toEqual([id]);
    const d = (await call('GET', `/demand/sheets/${id}`, accountant)).json() as DemandSheetDetail;
    expect(d.sheet.departmentId).toBe(ALL_DEPARTMENTS);
    expect(d.department).toMatchObject({ name: 'All departments', ddoName: expect.any(String) });
    const expected = preview.rows.filter((r) => !r.alreadyGenerated);
    expect(d.lines.length).toBe(sum(expected.map((r) => r.members)));
    expect(d.totals.demand).toBe(sum(expected.map((r) => r.total)));
    // Per department, in the order the lines come, with subtotals that add up to the sheet.
    expect(d.byDepartment?.map((p) => p.departmentId).sort()).toEqual(expected.filter((r) => r.members).map((r) => r.departmentId).sort());
    expect(sum(d.byDepartment!.map((p) => p.demand))).toBe(d.totals.demand);
    expect(d.lines.every((l) => l.departmentId)).toBe(true);
    // Already generated: a second Generate is refused.
    expect((await call('POST', '/demand/generate', accountant, { cycle })).statusCode).toBe(400);
  });

  it('the index shows a row per department, each opening the one sheet', async () => {
    const o = (await call('GET', `/demand?cycle=${cycle}`, accountant)).json() as DemandCycleOverview;
    expect(o.rows.length).toBeGreaterThan(1);
    expect(o.rows.every((r) => r.id === id && r.allDepartments && r.status === 'GENERATED')).toBe(true);
    const d = (await call('GET', `/demand/sheets/${id}`, accountant)).json() as DemandSheetDetail;
    expect(o.totals.demand).toBe(d.totals.demand);
    expect(o.totals.notGenerated).toBe(0);
  });

  it('the one DDO opens it; the steps and the ledger posting are the usual ones', { timeout: 120_000 }, async () => {
    expect((await call('GET', `/demand/sheets/${id}`, ddo)).statusCode).toBe(200);
    expect((await call('POST', `/demand/sheets/${id}/actions/certify`, accountant)).json().sheet.status).toBe('CERTIFIED');
    expect((await call('POST', `/demand/sheets/${id}/actions/sendToDdo`, accountant)).json().sheet.status).toBe('SENT_TO_DDO');
    const posted = (await call('POST', `/demand/sheets/${id}/actions/postRecovery`, accountant, { recovered: {} })).json() as DemandSheetDetail;
    expect(posted.sheet.status).toBe('RECOVERY_POSTED');
    expect(posted.sheet.totalRecovered).toBe(posted.totals.demand);
    expect(sum(posted.byDepartment!.map((p) => p.recovered))).toBe(posted.sheet.totalRecovered);
  });

  it('back to a DDO per department: the cycle stays generated, nothing is made twice', async () => {
    expect((await call('PUT', '/settings/values', admin, { ddoMode: 'PER_DEPARTMENT' })).statusCode).toBe(200);
    const preview = (await call('GET', `/demand/preview?cycle=${cycle}`, accountant)).json() as DemandPreview;
    expect(preview.singleSheet).toBeUndefined();
    expect(preview.rows.every((r) => r.alreadyGenerated)).toBe(true);
    expect((await call('POST', '/demand/generate', accountant, { cycle })).statusCode).toBe(400);
  });
});
