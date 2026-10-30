import { randomUUID } from 'node:crypto';
import {
  ageOn,
  applyProfileChange,
  calculateLeftoverService,
  expectedRetirementDate,
  formatCycle,
  formatDisplayDate,
  maskMobile,
  PROFILE_FIELDS,
  REQUIRED_DOCUMENTS,
  transferEffectiveCycle,
  validateMemberInput,
} from '@tgs/domain';
import type {
  Address,
  Member,
  MemberDetail,
  MemberDocument,
  MemberInput,
  MemberList,
  MemberListParams,
  MemberLoanRow,
  MemberRow,
  MyProfile,
  ProfileChangeRequest,
  ProfileFieldChange,
  RecoveryMandate,
  ServiceEvent,
  SessionUser,
  ShareAccount,
  TransferEvent,
  TransferInput,
} from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessToday } from '../../common/utils/business-date';
import { withTransaction, type Tx } from '../../db/transaction';
import type { MembersRepository } from './members.repository';

/** What the mock still owns for a member until P5–P7 (dev bridge, docs/22 §5.4). */
interface LegacyMember {
  today: string;
  currentCycle: string;
  loans: MemberLoanRow[];
  guarantees: MemberLoanRow[];
  deposits: MemberDetail['deposits'];
  shares: ShareAccount | null;
  ledger: MemberDetail['ledger'];
  changeRequests: ProfileChangeRequest[];
  demandCycles: string[];
}

interface LegacySummary {
  today: string;
  currentCycle: string;
  rows: Record<string, { activeLoans: number; outstanding: number; pendingChanges: number }>;
  pendingChangeRequests: Array<{ id: string; memberId: string; route: 'OFFICE' | 'DDO_THEN_OFFICE' }>;
}

const EMPTY_LEGACY = (today: string): LegacyMember => ({ today, currentCycle: today.slice(0, 7), loans: [], guarantees: [], deposits: [], shares: null, ledger: [], changeRequests: [], demandCycles: [] });

function documentsOf(m: Member): MemberDocument[] {
  return REQUIRED_DOCUMENTS.filter((d) => d.required || m.employmentType === 'APPROVED_PROBATIONER').map((d) => ({
    type: d.type,
    label: d.label,
    fileName: `${d.type.toLowerCase().replace(/_/g, '-')}-${m.generalNo}.${d.type === 'PHOTO' ? 'jpg' : 'pdf'}`,
    uploadedOn: m.joinedSocietyOn,
    uploadedBy: 'Society office',
  }));
}

/**
 * ST-10…13 members (P4a). Rules come from @tgs/domain (validateMemberInput, transferEffectiveCycle),
 * the same as the mock. Every change is pushed to the mock (record sync) while it still owns loans,
 * deposits and demand.
 */
export class MembersService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: MembersRepository,
  ) {}

  // ---- ST-10 list ----
  async list(user: SessionUser, q: MemberListParams & { sort?: string; page?: number; pageSize?: number }): Promise<MemberList> {
    await this.requireView(user);
    const scope = user.role === 'DDO' ? user.departmentId : undefined;
    const [membersInScope, mandates, departments, summary, pendingChanges] = await Promise.all([this.repo.list(scope), this.repo.currentMandates(scope), this.app.departments.all(), this.summary(), this.app.profileChanges.pending()]);
    const pendingByMember = new Map<string, number>();
    for (const r of pendingChanges) pendingByMember.set(r.memberId, (pendingByMember.get(r.memberId) ?? 0) + 1);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const scoped: MemberRow[] = membersInScope.map((m) => {
      const extra = summary.rows[m.id];
      const mandate = mandates.get(m.id);
      return {
        id: m.id,
        generalNo: m.generalNo,
        name: m.name,
        employeeId: m.employeeId,
        departmentId: m.departmentId,
        departmentName: deptName.get(m.departmentId) ?? m.departmentId,
        designation: m.designation,
        mobileMasked: m.mobileMasked,
        dor: m.dor,
        leftoverMonths: calculateLeftoverService(m.dor, summary.today).months,
        numberOfShares: m.numberOfShares,
        activeLoans: extra?.activeLoans ?? 0,
        outstanding: extra?.outstanding ?? 0,
        status: m.status,
        ...(mandate ? { mandateStatus: mandate.status } : {}),
        pendingChanges: pendingByMember.get(m.id) ?? 0,
      };
    });
    const text = (q.q ?? '').trim().toLowerCase();
    const status = q.status ?? 'ACTIVE';
    const retiring = Number(q.retiringWithinMonths ?? 0);
    const rows = scoped.filter(
      (r) =>
        (status === 'ALL' || r.status === status) &&
        (!q.departmentId || r.departmentId === q.departmentId) &&
        (!retiring || (r.status === 'ACTIVE' && r.leftoverMonths <= retiring)) &&
        (!q.hasActiveLoan || r.activeLoans > 0) &&
        (!q.mandatePending || r.mandateStatus === 'PENDING_NEW_DDO') &&
        (!text || r.name.toLowerCase().includes(text) || r.generalNo.includes(text) || r.employeeId.toLowerCase().includes(text)),
    );
    const sorters: Record<string, (a: MemberRow, b: MemberRow) => number> = {
      generalNo: (a, b) => Number(a.generalNo) - Number(b.generalNo),
      name: (a, b) => a.name.localeCompare(b.name),
      dor: (a, b) => a.dor.localeCompare(b.dor),
      outstanding: (a, b) => b.outstanding - a.outstanding,
    };
    rows.sort(sorters[q.sort ?? 'generalNo'] ?? sorters.generalNo);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const page = Math.max(1, q.page ?? 1);
    const scopeIds = new Set(scoped.map((r) => r.id));
    const changeRequests = pendingChanges.filter((r) => scopeIds.has(r.memberId) && (user.role !== 'DDO' || r.route === 'DDO_THEN_OFFICE')).length;
    const dept = scope ? departments.find((d) => d.id === scope) : undefined;
    return {
      asOf: summary.today,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      counts: {
        all: scoped.length,
        active: scoped.filter((r) => r.status === 'ACTIVE').length,
        retiringSoon: scoped.filter((r) => r.status === 'ACTIVE' && r.leftoverMonths <= 6).length,
        mandatePending: scoped.filter((r) => r.mandateStatus === 'PENDING_NEW_DDO').length,
        changeRequests,
      },
      scope: dept ? { departmentId: dept.id, departmentName: dept.name } : {},
      canCreate: await this.app.permissions.has(user.role, 'members.edit'),
    };
  }

  // ---- ST-12 profile ----
  async detail(user: SessionUser, idOrGeneralNo: string): Promise<MemberDetail> {
    await this.requireView(user);
    return this.toDetail(user, await this.load(user, idOrGeneralNo));
  }

  // ---- ST-11 create / edit ----
  async create(request: FastifyRequest, input: Partial<MemberInput>): Promise<MemberDetail> {
    const user = sessionOf(request);
    await this.requireEdit(user, 'Only the Super Admin and the Accountant can add members.');
    const valid = await this.validate(input);
    await this.app.appAccounts.assertMobileFree(valid.mobile);
    const [today, settings, dept] = await Promise.all([businessToday(this.app), this.app.masters.settings(), this.app.departments.get(valid.departmentId)]);

    const created = await withTransaction(this.app.db, async (tx) => {
      const generalNo = await this.repo.nextGeneralNo(tx);
      const member: Member = {
        id: `mem-${generalNo}`,
        generalNo,
        employeeId: valid.employeeId.trim(),
        name: valid.name.trim(),
        fatherName: valid.fatherName.trim(),
        gender: valid.gender,
        dob: valid.dob,
        mobile: valid.mobile,
        mobileMasked: maskMobile(valid.mobile),
        ...(valid.email?.trim() ? { email: valid.email.trim() } : {}),
        presentAddress: valid.presentAddress,
        permanentAddress: valid.permanentAddress,
        designation: valid.designation,
        departmentId: valid.departmentId,
        doj: valid.doj,
        dor: valid.dor,
        employmentType: valid.employmentType,
        numberOfShares: valid.numberOfShares,
        nominee: valid.nominee,
        payProfile: { ...valid.payProfile, certifiedAt: today },
        ...(valid.anniversaryDate ? { anniversaryDate: valid.anniversaryDate } : {}),
        status: 'ACTIVE',
        portalActivated: false,
        joinedSocietyOn: today,
      };
      // Office entry from the paper form: the F5 mandate already carries the DDO's signature.
      const mandate: RecoveryMandate = { id: `mdt-${generalNo}-1`, memberId: member.id, departmentId: member.departmentId, status: 'AGREED', signedOn: today, agreedOn: today, agreedByName: dept?.ddoName ?? 'DDO' };
      const event: ServiceEvent = { id: `sev-${randomUUID().slice(0, 8)}`, memberId: member.id, type: 'JOINED', date: today, summary: `Joined the society (General No. ${generalNo}) from ${dept?.name ?? ''} as ${member.designation}`, byName: user.name };
      await this.repo.insert(tx, member);
      await this.repo.insertMandate(tx, mandate);
      await this.repo.addEvent(tx, event);
      await this.app.appAccounts.upsertMember(tx, { id: member.id, generalNo, employeeId: member.employeeId, name: member.name, mobile: member.mobile, active: true });
      await this.app.audit.record(request, { action: 'create', entity: 'member', entityId: member.id, summary: `Added member ${member.name} (General No. ${generalNo})`, after: member }, tx);
      return { member, mandate, event };
    });
    // TODO(P5): share accounts move with loans; until then the mock keeps them.
    const share: ShareAccount = { memberId: created.member.id, numberOfShares: created.member.numberOfShares, shareCapital: created.member.numberOfShares * settings.shareValue, shareDepositBalance: 0 };
    await this.syncToMock({ members: [created.member], mandates: [created.mandate], serviceEvents: [created.event], shareAccounts: [share] });
    return this.toDetail(user, created.member);
  }

  async update(request: FastifyRequest, idOrGeneralNo: string, body: Partial<MemberInput>): Promise<MemberDetail> {
    const user = sessionOf(request);
    await this.requireEdit(user, 'Only the Super Admin and the Accountant can edit members.');
    const current = await this.load(user, idOrGeneralNo);
    if (current.status !== 'ACTIVE') fail('RULE_VIOLATION', 'Only active members can be edited.');
    if (body.departmentId && body.departmentId !== current.departmentId) fail('VALIDATION_ERROR', 'Use Transfer to change the department.', { fieldErrors: { departmentId: 'Use Transfer to change the department (ST-13)' } });
    // Shares change through a share purchase, not an edit: keep the current number.
    const input = await this.validate({ ...body, departmentId: current.departmentId, numberOfShares: current.numberOfShares }, current.id);
    if (input.mobile !== current.mobile) await this.app.appAccounts.assertMobileFree(input.mobile, current.id);
    const next: Member = {
      ...current,
      employeeId: input.employeeId.trim(),
      name: input.name.trim(),
      fatherName: input.fatherName.trim(),
      gender: input.gender,
      dob: input.dob,
      mobile: input.mobile,
      mobileMasked: maskMobile(input.mobile),
      presentAddress: input.presentAddress,
      permanentAddress: input.permanentAddress,
      designation: input.designation,
      doj: input.doj,
      dor: input.dor,
      employmentType: input.employmentType,
      nominee: input.nominee,
      payProfile: { ...current.payProfile, ...input.payProfile },
    };
    if (input.email?.trim()) next.email = input.email.trim();
    else delete next.email;
    if (input.anniversaryDate) next.anniversaryDate = input.anniversaryDate;
    else delete next.anniversaryDate;
    const changed = (Object.keys(next) as Array<keyof Member>).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]) && k !== 'mobileMasked');
    const today = await businessToday(this.app);
    const events: ServiceEvent[] = [];
    const event = (e: Omit<ServiceEvent, 'id' | 'memberId' | 'date' | 'byName'>) => events.push({ id: `sev-${randomUUID().slice(0, 8)}`, memberId: current.id, date: today, byName: user.name, ...e });
    if (current.designation !== next.designation) event({ type: 'DESIGNATION_CHANGED', summary: `Designation changed from ${current.designation} to ${next.designation}` });
    if (current.dor !== next.dor) event({ type: 'RETIREMENT_DATE_CHANGED', summary: `Date of retirement changed to ${formatDisplayDate(next.dor)}` });
    const other = changed.filter((k) => k !== 'designation' && k !== 'dor');
    if (other.length) event({ type: 'PROFILE_UPDATED', summary: `Profile edited by the office (${other.join(', ')})` });

    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(tx, next);
      for (const e of events) await this.repo.addEvent(tx, e);
      await this.app.appAccounts.upsertMember(tx, { id: next.id, generalNo: next.generalNo, employeeId: next.employeeId, name: next.name, mobile: next.mobile, active: next.status === 'ACTIVE' });
      if (changed.length) await this.app.audit.record(request, { action: 'update', entity: 'member', entityId: current.id, summary: `Edited ${next.name}: ${changed.join(', ')}`, before: current, after: next }, tx);
    });
    await this.syncToMock({ members: [next], serviceEvents: events });
    return this.toDetail(user, next);
  }

  // ---- ST-13 transfer (BR-010, BR-028) ----
  async transfer(request: FastifyRequest, idOrGeneralNo: string, input: Partial<TransferInput>): Promise<MemberDetail> {
    const user = sessionOf(request);
    await this.requireEdit(user, 'Only the Super Admin and the Accountant can transfer members.');
    const m = await this.load(user, idOrGeneralNo);
    if (m.status !== 'ACTIVE') fail('RULE_VIOLATION', 'Only active members can be transferred.');
    const to = input.toDepartmentId ? await this.app.departments.get(input.toDepartmentId) : undefined;
    const fieldErrors: Record<string, string> = {};
    if (!to) fieldErrors.toDepartmentId = 'Choose the new department';
    else if (to.id === m.departmentId) fieldErrors.toDepartmentId = 'The member is already in this department';
    if (!input.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) fieldErrors.effectiveDate = 'Enter the date the transfer takes effect';
    else if (input.effectiveDate < m.joinedSocietyOn) fieldErrors.effectiveDate = 'Cannot be before the member joined the society';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });

    // TODO(P7): demand sheets move to the backend; until then the generated cycles come from the mock.
    const legacy = await this.legacy(m.id);
    const effectiveCycle = transferEffectiveCycle(input.effectiveDate!, legacy.demandCycles);
    const fromName = (await this.app.departments.get(m.departmentId))?.name ?? m.departmentId;
    const today = legacy.today;
    const transfer: TransferEvent = { id: `trf-${randomUUID().slice(0, 8)}`, memberId: m.id, fromDepartmentId: m.departmentId, toDepartmentId: to!.id, effectiveCycle, effectiveDate: input.effectiveDate!, orderRef: input.orderRef?.trim() || '—', ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}), recordedAt: new Date().toISOString(), recordedByName: user.name };
    const next: Member = { ...m, departmentId: to!.id };
    // The salary-recovery mandate must be agreed again by the new DDO (BR-028).
    const mandate: RecoveryMandate = { id: `mdt-${m.generalNo}-${randomUUID().slice(0, 6)}`, memberId: m.id, departmentId: to!.id, status: 'PENDING_NEW_DDO', signedOn: today };
    const event: ServiceEvent = { id: `sev-${randomUUID().slice(0, 8)}`, memberId: m.id, type: 'TRANSFERRED', date: today, effectiveCycle, summary: `Transferred from ${fromName} to ${to!.name}${input.orderRef?.trim() ? ` (order ${input.orderRef.trim()})` : ''}. On the ${to!.name} demand sheet from ${formatCycle(effectiveCycle)}`, byName: user.name };
    const superseded = await this.repo.currentMandate(m.id);
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.insertTransfer(tx, transfer);
      await this.repo.update(tx, next);
      await this.repo.supersedeMandates(tx, m.id);
      await this.repo.insertMandate(tx, mandate);
      await this.repo.addEvent(tx, event);
      await this.app.audit.record(request, { action: 'transfer', entity: 'member', entityId: m.id, summary: `${m.name}: ${fromName} → ${to!.name} from ${formatCycle(effectiveCycle)}`, after: transfer }, tx);
    });
    await this.syncToMock({ members: [next], transfers: [transfer], mandates: [...(superseded ? [{ ...superseded, status: 'SUPERSEDED' as const }] : []), mandate], serviceEvents: [event] });
    return this.toDetail(user, next);
  }

  async agreeMandate(request: FastifyRequest, idOrGeneralNo: string): Promise<MemberDetail> {
    const user = sessionOf(request);
    await this.requireView(user);
    const m = await this.load(user, idOrGeneralNo);
    const mandate = await this.repo.currentMandate(m.id);
    if (!mandate || mandate.status !== 'PENDING_NEW_DDO') fail('INVALID_TRANSITION', 'Nothing to agree: the mandate is not waiting for a DDO.');
    const [login, dept] = await Promise.all([this.app.departments.ddoLogin(mandate!.departmentId), this.app.departments.get(mandate!.departmentId)]);
    let byName: string;
    if (user.role === 'DDO' && user.departmentId === mandate!.departmentId) byName = user.name;
    else if (!login && user.role !== 'DDO' && (await this.app.permissions.has(user.role, 'demo.control'))) byName = dept?.ddoName ?? 'DDO';
    else return fail('FORBIDDEN', `Waiting for ${dept?.ddoName ?? 'the DDO'} (DDO, ${dept?.name ?? ''}) to agree.`);
    const today = await businessToday(this.app);
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.agreeMandate(tx, mandate!.id, today, byName);
      await this.app.audit.record(request, { action: 'agree', entity: 'mandate', entityId: mandate!.id, summary: `${byName} agreed the salary recovery mandate for ${m.name}` }, tx);
    });
    await this.syncToMock({ mandates: [{ ...mandate!, status: 'AGREED', agreedOn: today, agreedByName: byName }] });
    return this.toDetail(user, m);
  }

  // ---- P4b: changes from change requests and the member app ----

  /**
   * Approved change request (D-057): write the values and log service events inside the caller's
   * transaction. Returns the records to sync to the mock once the transaction has committed.
   */
  async applyApprovedChanges(tx: Tx, memberId: string, fields: ProfileFieldChange[], byName: string): Promise<Record<string, unknown[]>> {
    let m = (await this.repo.find(memberId, tx)) ?? fail('NOT_FOUND', 'Member record not found.');
    const today = await businessToday(this.app);
    const events: ServiceEvent[] = [];
    for (const f of fields) {
      m = applyProfileChange(m, f);
      const label = PROFILE_FIELDS[f.field].label;
      const base = { id: 'sev-' + randomUUID().slice(0, 8), memberId, date: today, byName };
      if (f.field === 'designation') events.push({ ...base, type: 'DESIGNATION_CHANGED', summary: 'Designation changed from ' + f.oldValue + ' to ' + f.newValue });
      else if (f.field === 'dor') events.push({ ...base, type: 'RETIREMENT_DATE_CHANGED', summary: 'Date of retirement changed to ' + formatDisplayDate(f.newValue) });
      else events.push({ ...base, type: 'PROFILE_UPDATED', summary: label + ' updated on request' });
    }
    if (fields.some((f) => f.field.startsWith('payProfile.'))) m = { ...m, payProfile: { ...m.payProfile, certifiedAt: today } };
    await this.repo.update(tx, m);
    for (const e of events) await this.repo.addEvent(tx, e);
    await this.app.appAccounts.upsertMember(tx, { id: m.id, generalNo: m.generalNo, employeeId: m.employeeId, name: m.name, mobile: m.mobile, active: m.status === 'ACTIVE' });
    return { members: [m], serviceEvents: events };
  }

  // ---- P4c: a member admitted by the joining flow ----

  async duplicates(mobile: string | undefined, employeeId: string | undefined): Promise<Member[]> {
    return this.repo.byMobileOrEmployeeId(mobile, employeeId);
  }

  /**
   * Inside the joining transaction: allot the next General No., write the member, the mandate the
   * DDO agreed when certifying, the JOINED event, and turn the applicant's sign-in into theirs (D-026).
   */
  async admit(tx: Tx, draft: Omit<Member, 'id' | 'generalNo' | 'mobileMasked'>, mandateAgreedBy: string, byName: string): Promise<{ member: Member; mandate: RecoveryMandate; event: ServiceEvent }> {
    const generalNo = await this.repo.nextGeneralNo(tx);
    const member: Member = { ...draft, id: `mem-${generalNo}`, generalNo, mobileMasked: maskMobile(draft.mobile) };
    const dept = await this.app.departments.get(member.departmentId);
    const today = member.joinedSocietyOn;
    const mandate: RecoveryMandate = { id: `mdt-${generalNo}-1`, memberId: member.id, departmentId: member.departmentId, status: 'AGREED', signedOn: today, agreedOn: today, agreedByName: mandateAgreedBy };
    const event: ServiceEvent = { id: `sev-${randomUUID().slice(0, 8)}`, memberId: member.id, type: 'JOINED', date: today, summary: `Joined the society (General No. ${generalNo}) from ${dept?.name ?? ''} as ${member.designation}`, byName };
    await this.repo.insert(tx, member);
    await this.repo.insertMandate(tx, mandate);
    await this.repo.addEvent(tx, event);
    await this.app.appAccounts.memberJoined(tx, { id: member.id, generalNo, employeeId: member.employeeId, name: member.name, mobile: member.mobile, active: true });
    return { member, mandate, event };
  }

  /** Record sync for callers that changed members inside their own transaction. */
  async sync(records: Record<string, unknown[]>): Promise<void> {
    await this.syncToMock(records);
  }

  /** MB-02 My profile. */
  async myProfile(user: SessionUser): Promise<MyProfile> {
    const m = await this.mine(user);
    const [legacy, events, mandate, changeRequests, dept] = await Promise.all([this.legacy(m.id), this.repo.events(m.id), this.repo.currentMandate(m.id), this.app.profileChanges.forMember(m.id), this.app.departments.get(m.departmentId)]);
    return {
      member: m,
      departmentName: dept?.name ?? m.departmentId,
      leftover: calculateLeftoverService(m.dor, legacy.today),
      shares: legacy.shares,
      serviceEvents: events,
      mandate,
      documents: documentsOf(m),
      changeRequests,
      pendingFields: changeRequests.filter((r) => r.status === 'PENDING').flatMap((r) => r.fields.map((f) => f.field)),
    };
  }

  /** MB-19: email and present address are saved straight away (D-044). */
  async updateContact(request: FastifyRequest, body: { email?: string; presentAddress?: Address }): Promise<MyProfile> {
    const user = sessionOf(request);
    const m = await this.mine(user);
    const fieldErrors: Record<string, string> = {};
    if (body.email !== undefined && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) fieldErrors.email = 'Enter a valid email or leave it blank';
    if (body.presentAddress) {
      const a = body.presentAddress;
      if (!a.line1?.trim()) fieldErrors['presentAddress.line1'] = 'Required';
      if (!a.city?.trim()) fieldErrors['presentAddress.city'] = 'Required';
      if (!/^\d{6}$/.test(a.pincode ?? '')) fieldErrors['presentAddress.pincode'] = 'PIN code must be 6 digits';
    }
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const next: Member = { ...m };
    const parts: string[] = [];
    if (body.email !== undefined && body.email.trim() !== (m.email ?? '')) {
      if (body.email.trim()) next.email = body.email.trim();
      else delete next.email;
      parts.push('email');
    }
    if (body.presentAddress && JSON.stringify(body.presentAddress) !== JSON.stringify(m.presentAddress)) {
      next.presentAddress = body.presentAddress;
      parts.push('present address');
    }
    if (parts.length) {
      const event: ServiceEvent = { id: 'sev-' + randomUUID().slice(0, 8), memberId: m.id, type: 'PROFILE_UPDATED', date: await businessToday(this.app), summary: 'Updated ' + parts.join(' and ') + ' in the app', byName: m.name };
      await withTransaction(this.app.db, async (tx) => {
        await this.repo.update(tx, next);
        await this.repo.addEvent(tx, event);
        await this.app.audit.record(request, { action: 'contact', entity: 'member', entityId: m.id, summary: m.name + ' updated ' + parts.join(', ') }, tx);
      });
      await this.syncToMock({ members: [next], serviceEvents: [event] });
    }
    return this.myProfile(user);
  }

  /** MB-19: the new mobile is proven by a code; it becomes the Member App sign-in too. */
  async changeMobile(request: FastifyRequest, mobile: string): Promise<MyProfile> {
    const user = sessionOf(request);
    const m = await this.mine(user);
    const next: Member = { ...m, mobile, mobileMasked: maskMobile(mobile) };
    const event: ServiceEvent = { id: 'sev-' + randomUUID().slice(0, 8), memberId: m.id, type: 'PROFILE_UPDATED', date: await businessToday(this.app), summary: 'Mobile number changed to ' + next.mobileMasked + ' (verified by OTP)', byName: m.name };
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(tx, next);
      await this.repo.addEvent(tx, event);
      await this.app.appAccounts.upsertMember(tx, { id: m.id, generalNo: m.generalNo, employeeId: m.employeeId, name: m.name, mobile, active: m.status === 'ACTIVE' });
      await this.app.audit.record(request, { action: 'mobile', entity: 'member', entityId: m.id, summary: m.name + ' changed mobile (OTP verified)' }, tx);
    });
    await this.syncToMock({ members: [next], serviceEvents: [event] });
    return this.myProfile(user);
  }

  /** The signed-in member's record (Member App). */
  async mine(user: SessionUser): Promise<Member> {
    if (user.role !== 'MEMBER' || !user.memberId) fail('FORBIDDEN', 'Members only.');
    return (await this.repo.find(user.memberId!)) ?? fail('NOT_FOUND', 'Member record not found.');
  }

  async byId(id: string): Promise<Member | undefined> {
    return this.repo.find(id);
  }

  // ---- helpers ----
  private async toDetail(user: SessionUser, m: Member): Promise<MemberDetail> {
    const [legacy, settings, department, events, mandate, transfers, canEdit, canDemo] = await Promise.all([
      this.legacy(m.id),
      this.app.masters.settings(),
      this.app.departments.get(m.departmentId),
      this.repo.events(m.id),
      this.repo.currentMandate(m.id),
      this.repo.transfers(m.id),
      this.app.permissions.has(user.role, 'members.edit'),
      this.app.permissions.has(user.role, 'demo.control'),
    ]);
    const today = legacy.today;
    const expectedDor = expectedRetirementDate(m.dob, settings.retirementAge);
    const seeFullMobile = user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTANT';
    const mandatePending = mandate?.status === 'PENDING_NEW_DDO';
    const ddoForMandate = mandate ? await this.app.departments.ddoLogin(mandate.departmentId) : undefined;
    const mandateDept = mandatePending ? await this.app.departments.get(mandate.departmentId) : undefined;
    const upcoming = transfers.filter((t) => t.effectiveCycle > legacy.currentCycle).at(-1);
    const deptName = async (id: string) => (await this.app.departments.get(id))?.name ?? id;
    return {
      member: seeFullMobile ? m : { ...m, mobile: m.mobileMasked },
      department: department ?? null,
      leftover: calculateLeftoverService(m.dor, today),
      ageYears: ageOn(m.dob, today),
      ...(m.dor !== expectedDor ? { dorWarning: `At retirement age ${settings.retirementAge} the date of retirement would be ${formatDisplayDate(expectedDor)}. Check the service record.` } : {}),
      shares: legacy.shares,
      loans: legacy.loans,
      guarantees: legacy.guarantees,
      deposits: legacy.deposits,
      serviceEvents: events,
      mandate,
      ...(upcoming ? { upcomingTransfer: { ...upcoming, toDepartmentName: await deptName(upcoming.toDepartmentId), fromDepartmentName: await deptName(upcoming.fromDepartmentId) } } : {}),
      documents: documentsOf(m),
      changeRequests: await this.app.profileChanges.forMember(m.id),
      ledger: legacy.ledger,
      can: {
        edit: canEdit && m.status === 'ACTIVE',
        transfer: canEdit && m.status === 'ACTIVE',
        agreeMandate: mandatePending && user.role === 'DDO' && user.departmentId === mandate.departmentId,
        seeFullMobile,
      },
      ...(mandatePending && !ddoForMandate && canDemo && user.role !== 'DDO' ? { demoAgreeAs: `${mandateDept?.ddoName ?? 'DDO'} (DDO, ${mandateDept?.name ?? ''})` } : {}),
    };
  }

  private async load(user: SessionUser, idOrGeneralNo: string): Promise<Member> {
    const m = await this.repo.find(idOrGeneralNo);
    // DDOs only see members of their own department (docs/03).
    if (!m || (user.role === 'DDO' && m.departmentId !== user.departmentId)) return fail('NOT_FOUND', 'This member does not exist or is outside your department.');
    return m;
  }

  private async validate(input: Partial<MemberInput>, selfId?: string): Promise<MemberInput> {
    const [settings, others, today] = await Promise.all([this.app.masters.settings(), this.repo.others(selfId), businessToday(this.app)]);
    const fieldErrors = validateMemberInput(input, { today, minShares: settings.minShares, maxShares: settings.maxShares, others, ...(selfId ? { selfId } : {}) });
    if (input.departmentId && !(await this.app.departments.get(input.departmentId))) fieldErrors.departmentId = 'Unknown department';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    return input as MemberInput;
  }

  private async requireView(user: SessionUser): Promise<void> {
    const staff = user.role !== 'MEMBER' && user.role !== 'APPLICANT';
    if (!staff || !(await this.app.permissions.has(user.role, 'members.view'))) fail('FORBIDDEN', 'You do not have access to members.');
  }

  private async requireEdit(user: SessionUser, message: string): Promise<void> {
    if (!(await this.app.permissions.has(user.role, 'members.edit'))) fail('FORBIDDEN', message);
  }

  /** TODO(P5–P7): loans, deposits, shares and demand move to the backend; until then from the mock. */
  private async legacy(memberId: string): Promise<LegacyMember> {
    const bridge = this.app.mockBridge;
    if (!bridge) return EMPTY_LEGACY(await businessToday(this.app));
    return bridge.getPublic<LegacyMember>(`/api/v1/__demo/legacy/member/${encodeURIComponent(memberId)}`).catch(async () => EMPTY_LEGACY(await businessToday(this.app)));
  }

  private async summary(): Promise<LegacySummary> {
    const bridge = this.app.mockBridge;
    const empty = async (): Promise<LegacySummary> => {
      const today = await businessToday(this.app);
      return { today, currentCycle: today.slice(0, 7), rows: {}, pendingChangeRequests: [] };
    };
    if (!bridge) return empty();
    return bridge.getPublic<LegacySummary>('/api/v1/__demo/legacy/members-summary').catch(empty);
  }

  /** Record sync (dev, docs/22 §5.4): the mock's loans, deposits and demand read these. */
  private async syncToMock(records: Record<string, unknown[]>): Promise<void> {
    await this.app.mockBridge?.sync(records).catch((err) => this.app.log.warn({ err }, 'mock sync failed'));
  }
}
