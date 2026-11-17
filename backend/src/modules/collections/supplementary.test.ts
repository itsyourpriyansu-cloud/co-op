import type { DemandSheetDetail, DemandTopUpPreview, Session } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// D-124: Regenerate before Certify, and a supplementary sheet for members the month's sheet missed.
describe('regenerate and supplementary demand sheets (D-124)', () => {
  let app: FastifyInstance;
  let accountant: Session;
  let cashier: Session;
  let ddoFin: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const cycle = '2026-11';
  const main = 'ds-2026-11-fin';
  const sheet = async (id: string) => (await call('GET', `/demand/sheets/${id}`, accountant)).json() as DemandSheetDetail;
  const finMembers = data.members.filter((m) => m.departmentId === 'dept-fin' && m.status === 'ACTIVE');
  const missing = finMembers[0]!;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [accountant, cashier, ddoFin] = await Promise.all([signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'stf-ddo-fin')]);
    await call('POST', '/demand/generate', accountant, { cycle, departmentIds: ['dept-fin'] });
  });
  afterAll(() => app.close());

  it('Regenerate adds a member the sheet missed, before Certify; only the Accountant; the preview says who', async () => {
    // Simulate a member the sheet did not include (e.g. activated after Generate).
    await app.db.execute(sql`delete from demand_lines where sheet_id = ${main} and member_id = ${missing.id}`);
    const before = await sheet(main);
    expect(before.lines.some((l) => l.memberId === missing.id)).toBe(false);

    expect((await call('GET', `/demand/sheets/${main}/regenerate-preview`, cashier)).statusCode).toBe(403);
    expect((await call('POST', `/demand/sheets/${main}/regenerate`, ddoFin)).statusCode).toBe(403);
    const preview = (await call('GET', `/demand/sheets/${main}/regenerate-preview`, accountant)).json() as DemandTopUpPreview;
    expect(preview.added.map((a) => a.memberId)).toEqual([missing.id]);
    expect(preview.removed).toEqual([]);
    expect(preview.blocked).toBeUndefined();

    expect((await call('POST', `/demand/sheets/${main}/regenerate`, accountant)).statusCode).toBe(200);
    const after = await sheet(main);
    expect(after.lines.some((l) => l.memberId === missing.id)).toBe(true);
    expect(after.sheet.status).toBe('GENERATED');
    expect(after.sheet.totalDemand).toBe(preview.newTotal);
    expect(after.sheet.events?.at(-1)).toMatchObject({ action: 'regenerate' });
    // Nothing left to add the second time.
    expect(((await call('GET', `/demand/sheets/${main}/regenerate-preview`, accountant)).json() as DemandTopUpPreview).added).toEqual([]);
  });

  it('is refused once a payment is recorded on the sheet, and once the sheet is certified', async () => {
    const line = (await sheet(main)).lines.find((l) => l.totalDemand > 0)!;
    await app.db.execute(sql`update demand_lines set components = (select jsonb_agg(jsonb_set(c, '{allocated}', to_jsonb(least((c->>'amount')::bigint, 100)))) from jsonb_array_elements(components) c) where sheet_id = ${main} and member_id = ${line.memberId}`);
    const blocked = (await call('GET', `/demand/sheets/${main}/regenerate-preview`, accountant)).json() as DemandTopUpPreview;
    expect(blocked.blocked).toMatch(/Payments or deductions/);
    expect((await call('POST', `/demand/sheets/${main}/regenerate`, accountant)).json().code).toBe('INVALID_TRANSITION');
    // Put it back so the sheet can be certified in the next test.
    await app.db.execute(sql`update demand_lines set components = (select jsonb_agg(jsonb_set(c, '{allocated}', '0'::jsonb)) from jsonb_array_elements(components) c) where sheet_id = ${main} and member_id = ${line.memberId}`);
  });

  it('after Certify: a supplementary sheet carries only the missing members, and goes through the same steps', async () => {
    await app.db.execute(sql`delete from demand_lines where sheet_id = ${main} and member_id = ${missing.id}`);
    // Not certified yet: the supplementary route points to Regenerate.
    const early = (await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-fin`, accountant)).json() as DemandTopUpPreview;
    expect(early.blocked).toMatch(/Regenerate/);

    expect((await call('POST', `/demand/sheets/${main}/actions/certify`, accountant)).json().sheet.status).toBe('CERTIFIED');
    expect(((await call('POST', `/demand/sheets/${main}/regenerate`, accountant)).json()).code).toBe('INVALID_TRANSITION');

    const preview = (await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-fin`, accountant)).json() as DemandTopUpPreview;
    expect(preview.blocked).toBeUndefined();
    expect(preview.added.map((a) => a.memberId)).toEqual([missing.id]);

    expect((await call('POST', '/demand/supplementary', cashier, { cycle, departmentId: 'dept-fin' })).statusCode).toBe(403);
    const made = (await call('POST', '/demand/supplementary', accountant, { cycle, departmentId: 'dept-fin' })).json();
    expect(made.id).toBe(`${main}-s1`);
    const supp = await sheet(made.id);
    expect(supp.sheet).toMatchObject({ supplementNo: 1, status: 'GENERATED', cycle, departmentId: 'dept-fin' });
    expect(supp.lines.map((l) => l.memberId)).toEqual([missing.id]);
    // The month's own sheet is untouched and nobody is on both.
    const original = await sheet(main);
    expect(original.sheet.status).toBe('CERTIFIED');
    expect(original.lines.some((l) => l.memberId === missing.id)).toBe(false);

    // Same steps. A second supplement waits until the first one is sent.
    expect(((await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-fin`, accountant)).json() as DemandTopUpPreview).blocked).toMatch(/Supplement 1 is not sent/);
    expect((await call('POST', `/demand/sheets/${made.id}/actions/certify`, accountant)).json().sheet.status).toBe('CERTIFIED');
    expect((await call('POST', `/demand/sheets/${made.id}/actions/sendToDdo`, accountant)).json().sheet.status).toBe('SENT_TO_DDO');
    expect(((await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-fin`, accountant)).json() as DemandTopUpPreview).blocked).toMatch(/Nobody is missing/);
    expect((await call('POST', '/demand/supplementary', accountant, { cycle, departmentId: 'dept-fin' })).statusCode).toBe(400);

    // The overview lists it as its own row, and the DDO of the department sees it.
    const o = (await call('GET', `/demand?cycle=${cycle}`, accountant)).json();
    const rows = o.rows.filter((r: { departmentId: string }) => r.departmentId === 'dept-fin');
    expect(rows.map((r: { supplementNo?: number }) => r.supplementNo)).toEqual([undefined, 1]);
    expect(o.totals.generated).toBe(o.rows.filter((r: { supplementNo?: number; status: string }) => !r.supplementNo && r.status !== 'NOT_GENERATED').length);
    expect((await call('GET', `/demand/sheets/${made.id}`, ddoFin)).statusCode).toBe(200);
  });

  it('a late joiner owes only share capital and loans on the supplement unless the Admin says the month is owed', async () => {
    // Make a member of another department look like a late joiner: joined after the month's sheet was made.
    await call('POST', '/demand/generate', accountant, { cycle, departmentIds: ['dept-gad'] });
    const gad = 'ds-2026-11-gad';
    const late = (await sheet(gad)).lines[0]!;
    await app.db.execute(sql`delete from demand_lines where sheet_id = ${gad} and member_id = ${late.memberId}`);
    await app.db.execute(sql`update members set joined_society_on = '2026-11-15' where id = ${late.memberId}`);
    await call('POST', `/demand/sheets/${gad}/actions/certify`, accountant);
    const p = (await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-gad`, accountant)).json() as DemandTopUpPreview;
    // Monthly heads (RRF, CRD …) are dropped for a late joiner, so a member with nothing else owes nothing.
    const lateLine = p.added.find((a) => a.memberId === late.memberId);
    const monthly = late.components.filter((c) => ['RRF', 'INSURANCE', 'CRD', 'SRDS'].includes(c.head)).reduce((s, c) => s + c.amount, 0);
    if (monthly > 0) expect(lateLine ? lateLine.demand : 0).toBe(late.totalDemand - monthly);
    // The Admin can say the missed month is owed.
    const admin = await signInAs(app, 'stf-admin');
    expect((await call('PUT', '/settings/values', admin, { lateJoinerOwesMissedMonth: true })).statusCode).toBe(200);
    const owed = (await call('GET', `/demand/supplementary-preview?cycle=${cycle}&departmentId=dept-gad`, accountant)).json() as DemandTopUpPreview;
    expect(owed.added.find((a) => a.memberId === late.memberId)?.demand).toBe(late.totalDemand);
  });
});
