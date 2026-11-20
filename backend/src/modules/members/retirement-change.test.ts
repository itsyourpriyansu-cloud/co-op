import { serviceRemaining } from '@tgs/domain';
import type { MemberDetail, MemberHome, Session, WorkQueue } from '@tgs/types';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { demoDataset } from '../../db/seed/dataset';

// D-131: the date of retirement changes only through the Super Admin's request and the Accountant,
// Secretary and President's approvals; members see their service left; probationers short of the
// probation period are flagged; reviewers see the borrower's loan record.
describe('service and retirement date (D-131)', () => {
  let app: FastifyInstance;
  let admin: Session;
  let accountant: Session;
  let secretary: Session;
  let president: Session;
  const data = demoDataset();
  const lakshmi = data.members.find((m) => m.generalNo === '1101')!;
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const propose = (s: Session, body: object) => call('POST', `/members/${lakshmi.id}/retirement-change`, s, body);
  const decide = (s: Session, decision: 'approve' | 'reject', remarks?: string) => call('POST', `/members/${lakshmi.id}/retirement-change/decision`, s, { decision, ...(remarks ? { remarks } : {}) });
  const queue = async (s: Session) => ((await call('GET', '/work-queue', s)).json() as WorkQueue).items.filter((i) => i.kind === 'retirementChange');

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [admin, accountant, secretary, president] = await Promise.all([signInAs(app, 'stf-admin'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-secretary'), signInAs(app, 'stf-president')]);
  });
  afterAll(() => app.close());

  it('only the Super Admin proposes; edits and member requests cannot change the date', async () => {
    expect((await propose(accountant, { newDor: '2040-01-31', reason: 'Service register' })).statusCode).toBe(403);
    expect((await propose(admin, { newDor: lakshmi.dor, reason: 'x' })).json().fieldErrors).toMatchObject({ newDor: expect.any(String), reason: expect.any(String) });

    // A staff edit keeps the date whatever the body says.
    const d = (await call('GET', `/members/${lakshmi.id}`, accountant)).json() as MemberDetail;
    expect(d.can).toMatchObject({ proposeRetirementChange: false, decideRetirementChange: false });
    const m = d.member;
    const body = { name: m.name, fatherName: m.fatherName, gender: m.gender, caste: m.caste ?? 'OC', dob: m.dob, mobile: m.mobile, presentAddress: m.presentAddress, permanentAddress: m.permanentAddress, employeeId: m.employeeId, departmentId: m.departmentId, designation: m.designation, doj: m.doj, dor: '2041-01-31', employmentType: m.employmentType, numberOfShares: m.numberOfShares, nominee: m.nominee, payProfile: m.payProfile };
    const edited = await call('PUT', `/members/${lakshmi.id}`, accountant, body);
    expect(edited.statusCode).toBe(200);
    expect(edited.json().member.dor).toBe(lakshmi.dor);
  });

  it('goes Accountant → Secretary → President, each in turn, and the date changes on the last approval', async () => {
    expect((await call('GET', `/members/${lakshmi.id}`, admin)).json().can.proposeRetirementChange).toBe(true);
    const sent = (await propose(admin, { newDor: '2043-03-31', reason: 'Service register entry corrected' })).json() as MemberDetail;
    expect(sent.retirementChange).toMatchObject({ status: 'PENDING', currentDor: lakshmi.dor, newDor: '2043-03-31', nextApprover: 'ACCOUNTANT', approvals: [] });
    expect(sent.member.dor).toBe(lakshmi.dor);
    expect(sent.can.proposeRetirementChange).toBe(false);
    expect((await propose(admin, { newDor: '2043-01-31', reason: 'Second request' })).json().code).toBe('RULE_VIOLATION');

    // Out of turn is refused; the work queue shows it only to whoever is next.
    expect((await decide(president, 'approve')).statusCode).toBe(403);
    expect(await queue(accountant)).toHaveLength(1);
    expect(await queue(secretary)).toHaveLength(0);
    expect((await decide(accountant, 'approve')).json().retirementChange).toMatchObject({ nextApprover: 'SECRETARY' });
    expect(await queue(secretary)).toHaveLength(1);
    expect((await decide(secretary, 'approve')).json().retirementChange).toMatchObject({ nextApprover: 'PRESIDENT' });
    expect((await call('GET', `/members/${lakshmi.id}`, admin)).json().member.dor).toBe(lakshmi.dor);

    const done = (await decide(president, 'approve')).json() as MemberDetail;
    expect(done.member.dor).toBe('2043-03-31');
    expect(done.retirementChange).toMatchObject({ status: 'APPROVED' });
    expect(done.retirementChange!.approvals.map((a) => a.role)).toEqual(['ACCOUNTANT', 'SECRETARY', 'PRESIDENT']);
    expect(done.serviceEvents[0]).toMatchObject({ type: 'RETIREMENT_DATE_CHANGED' });
    expect((await decide(president, 'approve')).json().code).toBe('INVALID_TRANSITION');
  });

  it('a rejection needs a reason, stops it, and keeps the date', async () => {
    await propose(admin, { newDor: '2043-04-30', reason: 'Checking the service book' });
    expect((await decide(accountant, 'reject')).json().fieldErrors).toHaveProperty('remarks');
    const r = (await decide(accountant, 'reject', 'The service book says March')).json() as MemberDetail;
    expect(r.retirementChange).toMatchObject({ status: 'REJECTED', rejection: { role: 'ACCOUNTANT', remarks: 'The service book says March' } });
    expect(r.member.dor).toBe('2043-03-31');
    expect(await queue(secretary)).toHaveLength(0);
  });

  it('the member sees their service left on the home screen', async () => {
    const member = await signInAs(app, 'mem-1101');
    const home = (await call('GET', '/me/home', member)).json() as MemberHome;
    const today = data.today;
    expect(home.service).toEqual(serviceRemaining('2043-03-31', today));
    expect(home.service.days).toBeGreaterThan(0);
  });

  it('a probationer short of the probation period is flagged to staff, not blocked', async () => {
    const a = data.membershipApplications.find((x) => x.status !== 'DRAFT' && x.form?.employment)!;
    const today = data.today;
    await app.db.execute(sql`update membership_applications set data = jsonb_set(jsonb_set(data, '{form,employment,employmentType}', '"APPROVED_PROBATIONER"'), '{form,employment,regularAppointmentDate}', ${JSON.stringify(today)}::jsonb) where id = ${a.id}`);
    const checks = (await call('GET', `/membership/applications/${a.id}`, accountant)).json().checks as Array<{ ruleId: string; pass: boolean; severity: string }>;
    expect(checks.find((c) => c.ruleId === 'BR-054')).toMatchObject({ pass: false, severity: 'warn' });
  });

  it('a loan shows the borrower’s record: applied, approved, rejected', async () => {
    const loan = data.loans.find((l) => l.status === 'ACCOUNTANT_REVIEW')!;
    const mine = data.loans.filter((l) => l.memberId === loan.memberId);
    const history = (await call('GET', `/loans/${loan.id}`, accountant)).json().history;
    expect(history).toEqual({
      applied: mine.filter((l) => l.status !== 'DRAFT').length,
      approved: mine.filter((l) => ['SANCTIONED', 'ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'].includes(l.status)).length,
      rejected: mine.filter((l) => l.status === 'REJECTED').length,
    });
  });
});
