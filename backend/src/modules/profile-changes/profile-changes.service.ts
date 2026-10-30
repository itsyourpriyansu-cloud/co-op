import { randomUUID } from 'node:crypto';
import { changeRequestRoute, PROFILE_FIELDS, profileFieldValue, validateChangeRequest } from '@tgs/domain';
import type { ChangeRequestInput, ChangeRequestList, ChangeRequestRow, Member, ProfileChangeRequest, SessionUser } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { businessToday } from '../../common/utils/business-date';
import { notifyMember } from '../../common/utils/notify';
import { withTransaction } from '../../db/transaction';
import type { ProfileChangesRepository } from './profile-changes.repository';

const needsDdo = (r: ProfileChangeRequest) => r.status === 'PENDING' && r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified;
const fieldLabels = (r: ProfileChangeRequest) => r.fields.map((f) => PROFILE_FIELDS[f.field].label.toLowerCase()).join(', ');

/**
 * ST-18 / MB-19 profile change requests (D-044, D-057). Employment and pay changes go to the
 * member's DDO to certify first (route DDO_THEN_OFFICE); the Accountant then approves or rejects,
 * and approval writes the member record through the members service.
 */
export class ProfileChangesService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: ProfileChangesRepository,
  ) {}

  // ---- reads for other modules ----
  pending(): Promise<ProfileChangeRequest[]> {
    return this.repo.pending();
  }

  forMember(memberId: string): Promise<ProfileChangeRequest[]> {
    return this.repo.forMember(memberId);
  }

  // ---- ST-18 staff ----
  async list(user: SessionUser): Promise<ChangeRequestList> {
    await this.requireStaffView(user);
    const all = await this.repo.all();
    const members = new Map<string, Member>();
    for (const r of all) if (!members.has(r.memberId)) members.set(r.memberId, (await this.app.members.byId(r.memberId))!);
    const visible = all.filter((r) => this.visible(user, r, members.get(r.memberId)));
    const rows = await Promise.all(visible.map((r) => this.toRow(user, r, members.get(r.memberId)!)));
    rows.sort((a, b) => Number(!!b.myAction) - Number(!!a.myAction) || Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.createdAt.localeCompare(a.createdAt));
    return { rows, counts: { pending: rows.filter((r) => r.status === 'PENDING').length, waitingOnMe: rows.filter((r) => r.myAction).length } };
  }

  /** DDO step: certify (or refuse) the employment / pay values. */
  async certify(request: FastifyRequest, id: string, body: { approve?: boolean; remarks?: string }): Promise<ChangeRequestRow> {
    const user = sessionOf(request);
    await this.requireStaffView(user);
    const approve = body.approve ?? true;
    if (!approve && !body.remarks?.trim()) fail('VALIDATION_ERROR', 'Give a reason.', { fieldErrors: { remarks: 'Tell the member what is wrong' } });
    let member!: Member;
    const saved = await withTransaction(this.app.db, async (tx) => {
      const r = await this.loadPending(tx, user, id);
      member = (await this.app.members.byId(r.memberId))!;
      if (!needsDdo(r)) fail('INVALID_TRANSITION', 'This request does not need the DDO.');
      const [login, dept] = await Promise.all([this.app.departments.ddoLogin(member.departmentId), this.app.departments.get(member.departmentId)]);
      let byName: string;
      if (user.role === 'DDO' && user.departmentId === member.departmentId) byName = user.name;
      else if (!login && user.role !== 'DDO' && (await this.app.permissions.has(user.role, 'demo.control'))) byName = dept?.ddoName ?? 'DDO';
      else return fail('FORBIDDEN', `Only the ${dept?.name ?? ''} DDO can certify this.`);
      const at = new Date().toISOString();
      const next: ProfileChangeRequest = approve
        ? { ...r, ddoCertified: { byName, at, ...(body.remarks?.trim() ? { remarks: body.remarks.trim() } : {}) } }
        : { ...r, status: 'REJECTED', decidedByName: `${byName} (DDO)`, decidedAt: at, remarks: body.remarks!.trim() };
      await this.repo.save(tx, next);
      await this.app.audit.record(request, { action: approve ? 'certify' : 'reject', entity: 'profileChange', entityId: r.id, summary: `${byName} ${approve ? 'certified' : 'did not certify'} ${member.name}'s ${fieldLabels(r)}` }, tx);
      return next;
    });
    await this.sync([saved]);
    if (!approve) await this.notify(member.id, 'profile.rejected', { fields: fieldLabels(saved), reason: body.remarks!.trim() });
    return this.toRow(user, saved, member);
  }

  /** Accountant step (members.decideChanges): approval writes the member record. */
  async decide(request: FastifyRequest, id: string, body: { approve?: boolean; remarks?: string }): Promise<ChangeRequestRow> {
    const user = sessionOf(request);
    await this.requireStaffView(user);
    if (!(await this.app.permissions.has(user.role, 'members.decideChanges'))) fail('FORBIDDEN', 'Only the Accountant decides profile changes.');
    if (body.approve === undefined) fail('VALIDATION_ERROR', 'Approve or reject.');
    if (!body.approve && !body.remarks?.trim()) fail('VALIDATION_ERROR', 'Give a reason.', { fieldErrors: { remarks: 'Tell the member why' } });
    let records: Record<string, unknown[]> = {};
    const saved = await withTransaction(this.app.db, async (tx) => {
      const r = await this.loadPending(tx, user, id);
      if (needsDdo(r)) fail('INVALID_TRANSITION', 'Waiting for the DDO to certify the employment / pay details first.');
      const next: ProfileChangeRequest = { ...r, status: body.approve ? 'APPROVED' : 'REJECTED', decidedByName: user.name, decidedAt: new Date().toISOString(), ...(body.remarks?.trim() ? { remarks: body.remarks.trim() } : {}) };
      await this.repo.save(tx, next);
      if (body.approve) records = await this.app.members.applyApprovedChanges(tx, r.memberId, r.fields, user.name);
      const m = await this.app.members.byId(r.memberId);
      await this.app.audit.record(request, { action: body.approve ? 'approve' : 'reject', entity: 'profileChange', entityId: r.id, summary: `${body.approve ? 'Approved' : 'Rejected'} change of ${fieldLabels(r)} for General No. ${m?.generalNo ?? ''}` }, tx);
      return next;
    });
    await this.app.members.sync({ ...records, profileChangeRequests: [saved] });
    await this.notify(saved.memberId, body.approve ? 'profile.approved' : 'profile.rejected', { fields: fieldLabels(saved), reason: body.remarks?.trim() ?? '' });
    return this.toRow(user, saved, (await this.app.members.byId(saved.memberId))!);
  }

  // ---- MB-19 member ----
  async mine(user: SessionUser): Promise<ProfileChangeRequest[]> {
    const m = await this.app.members.mine(user);
    return this.repo.forMember(m.id);
  }

  async create(request: FastifyRequest, body: Partial<ChangeRequestInput>): Promise<ProfileChangeRequest> {
    const user = sessionOf(request);
    const m = await this.app.members.mine(user);
    const input = { fields: body.fields ?? [], reason: body.reason ?? '' };
    const pendingFields = (await this.repo.forMember(m.id)).filter((r) => r.status === 'PENDING').flatMap((r) => r.fields.map((f) => f.field));
    const fieldErrors = validateChangeRequest(m, input, pendingFields, await businessToday(this.app));
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const fields = input.fields.map(({ field, newValue }) => ({ field, oldValue: profileFieldValue(m, field), newValue: newValue.trim() }));
    const r: ProfileChangeRequest = {
      id: `pcr-${randomUUID().slice(0, 8)}`,
      memberId: m.id,
      fields,
      reason: input.reason.trim(),
      ...(body.documentName?.trim() ? { documentName: body.documentName.trim() } : {}),
      route: changeRequestRoute(fields.map((f) => f.field)),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.insert(tx, r);
      await this.app.audit.record(request, { action: 'request', entity: 'profileChange', entityId: r.id, summary: `${m.name} asked to change ${fieldLabels(r)}` }, tx);
    });
    await this.sync([r]);
    return r;
  }

  // ---- helpers ----
  private async toRow(user: SessionUser, r: ProfileChangeRequest, m: Member): Promise<ChangeRequestRow> {
    const [dept, login, accountant, canDecide, canDemo] = await Promise.all([
      this.app.departments.get(m.departmentId),
      this.app.departments.ddoLogin(m.departmentId),
      this.repo.staffName('ACCOUNTANT'),
      this.app.permissions.has(user.role, 'members.decideChanges'),
      this.app.permissions.has(user.role, 'demo.control'),
    ]);
    const ddoStep = needsDdo(r);
    const ddoName = login ? ((await this.app.departments.ddoLoginName(m.departmentId)) ?? dept?.ddoName) : dept?.ddoName;
    const waitingOn = r.status !== 'PENDING' ? undefined : ddoStep ? `${ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})` : `${accountant ?? 'Accountant'} (Accountant)`;
    const myAction = r.status !== 'PENDING' ? undefined : ddoStep ? (user.role === 'DDO' && user.departmentId === m.departmentId ? ('certify' as const) : undefined) : canDecide ? ('decide' as const) : undefined;
    return {
      ...r,
      memberName: m.name,
      generalNo: m.generalNo,
      departmentId: m.departmentId,
      departmentName: dept?.name ?? '',
      ...(waitingOn ? { waitingOn } : {}),
      ...(myAction ? { myAction } : {}),
      ...(ddoStep && !login && canDemo && user.role !== 'DDO' ? { demoCertifyAs: `${dept?.ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})` } : {}),
    };
  }

  /** A DDO sees only employment / pay requests of their own department. */
  private visible(user: SessionUser, r: ProfileChangeRequest, m: Member | undefined): boolean {
    if (user.role !== 'DDO') return true;
    return r.route === 'DDO_THEN_OFFICE' && m?.departmentId === user.departmentId;
  }

  private async loadPending(tx: Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0], user: SessionUser, id: string): Promise<ProfileChangeRequest> {
    const r = await this.repo.lock(tx, id);
    const m = r ? await this.app.members.byId(r.memberId) : undefined;
    if (!r || !this.visible(user, r, m)) return fail('NOT_FOUND', 'This request does not exist or is outside your department.');
    if (r.status !== 'PENDING') fail('INVALID_TRANSITION', 'This request has already been decided.');
    return r;
  }

  private async requireStaffView(user: SessionUser): Promise<void> {
    const staff = user.role !== 'MEMBER' && user.role !== 'APPLICANT';
    if (!staff || !(await this.app.permissions.has(user.role, 'members.view'))) fail('FORBIDDEN', 'You do not have access to members.');
  }

  private async sync(requests: ProfileChangeRequest[]): Promise<void> {
    await this.app.members.sync({ profileChangeRequests: requests });
  }

  private async notify(recipientId: string, templateKey: string, vars: Record<string, string>): Promise<void> {
    await notifyMember(this.app, recipientId, templateKey, vars, '/profile');
  }
}
