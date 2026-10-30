// Members module (ST-10 … ST-13, ST-18, MB-02, MB-19). Rules come from @tgs/domain:
// validateMemberInput (ST-11), transferEffectiveCycle (BR-010), changeRequestRoute (D-057).
import { randomUUID } from 'node:crypto';
import {
  ageOn,
  applyProfileChange,
  calculateLeftoverService,
  changeRequestRoute,
  expectedRetirementDate,
  formatCycle,
  formatDisplayDate,
  maskMobile,
  MOBILE_PATTERN,
  PROFILE_FIELDS,
  profileFieldValue,
  transferEffectiveCycle,
  validateChangeRequest,
  validateMemberInput,
} from '@tgs/domain';
import type {
  Address,
  ChangeRequestInput,
  ChangeRequestList,
  ChangeRequestRow,
  ContactUpdateInput,
  Member,
  MemberDetail,
  MemberDocument,
  MemberInput,
  MemberList,
  MemberLoanRow,
  MemberRow,
  MyProfile,
  OtpChallenge,
  ProfileChangeRequest,
  ProfileField,
  RecoveryMandate,
  ServiceEvent,
  SessionUser,
  TransferInput,
} from '@tgs/types';
import { audit, can, notify, nowIso, requireMember, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import { REQUIRED_DOCUMENTS } from './joining-reference';
import type { Db, Store } from './store';

const DEMO_OTP = '123456';
const OPEN_LOAN = new Set(['ACTIVE', 'SANCTIONED']);

/** Next free General No. (shared with joining activation). */
export function nextGeneralNo(db: Db): string {
  return String(Math.max(...db.members.map((m) => Number(m.generalNo))) + 1);
}

const deptName = (db: Db, id: string) => db.departments.find((d) => d.id === id)?.name ?? id;
const ddoLogin = (db: Db, departmentId: string) => db.staffUsers.find((u) => u.role === 'DDO' && u.departmentId === departmentId && u.active !== false);

function addEvent(db: Db, e: Omit<ServiceEvent, 'id'>) {
  db.serviceEvents.push({ id: `sev-${randomUUID().slice(0, 8)}`, ...e });
}

function currentMandate(db: Db, memberId: string): RecoveryMandate | null {
  return db.mandates.find((m) => m.memberId === memberId && m.status !== 'SUPERSEDED') ?? null;
}

/** DDOs only see members of their own department (docs/03). */
function visible(user: SessionUser, m: Member) {
  return user.role !== 'DDO' || m.departmentId === user.departmentId;
}

function documentsOf(m: Member): MemberDocument[] {
  return REQUIRED_DOCUMENTS.filter((d) => d.required || m.employmentType === 'APPROVED_PROBATIONER').map((d) => ({
    type: d.type,
    label: d.label,
    fileName: `${d.type.toLowerCase().replace(/_/g, '-')}-${m.generalNo}.${d.type === 'PHOTO' ? 'jpg' : 'pdf'}`,
    uploadedOn: m.joinedSocietyOn,
    uploadedBy: 'Society office',
  }));
}

function loanRows(db: Db, memberId: string): { loans: MemberLoanRow[]; guarantees: MemberLoanRow[] } {
  const product = (code: string) => db.loanProducts.find((p) => p.code === code)?.name ?? code;
  const base = (l: Db['loans'][number]): MemberLoanRow => ({
    id: l.id,
    applicationNo: l.applicationNo,
    ...(l.loanNo ? { loanNo: l.loanNo } : {}),
    product: l.product,
    productName: product(l.product),
    status: l.status,
    amount: l.sanctionedAmount ?? l.appliedAmount,
    outstanding: l.outstandingPrincipal,
    ...(l.emi ? { emi: l.emi } : {}),
    appliedOn: l.appliedOn,
  });
  const loans = db.loans.filter((l) => l.memberId === memberId).map(base);
  const guarantees = db.loans
    .filter((l) => l.memberId !== memberId && l.sureties.some((s) => s.memberId === memberId))
    .map((l) => {
      const b = db.members.find((m) => m.id === l.memberId);
      return { ...base(l), ...(b ? { borrower: { id: b.id, name: b.name, generalNo: b.generalNo } } : {}), suretyStatus: l.sureties.find((s) => s.memberId === memberId)!.status };
    });
  const recent = (a: MemberLoanRow, b: MemberLoanRow) => b.appliedOn.localeCompare(a.appliedOn);
  return { loans: loans.sort(recent), guarantees: guarantees.sort(recent) };
}

function toRow(db: Db, m: Member): MemberRow {
  const loans = db.loans.filter((l) => l.memberId === m.id && OPEN_LOAN.has(l.status));
  const mandate = currentMandate(db, m.id);
  return {
    id: m.id,
    generalNo: m.generalNo,
    name: m.name,
    employeeId: m.employeeId,
    departmentId: m.departmentId,
    departmentName: deptName(db, m.departmentId),
    designation: m.designation,
    mobileMasked: m.mobileMasked,
    dor: m.dor,
    leftoverMonths: calculateLeftoverService(m.dor, db.demo.today).months,
    numberOfShares: m.numberOfShares,
    activeLoans: loans.length,
    outstanding: loans.reduce((s, l) => s + l.outstandingPrincipal, 0),
    status: m.status,
    ...(mandate ? { mandateStatus: mandate.status } : {}),
    pendingChanges: db.profileChangeRequests.filter((r) => r.memberId === m.id && r.status === 'PENDING').length,
  };
}

/**
 * Dev bridge (docs/22 §5.4): the parts of a member page the mock still owns until P5–P7 (loans,
 * guarantees, deposits, share account, demand history) and P4b (change requests).
 */
export function legacyMemberExtras(db: Db, m: Member) {
  const { loans, guarantees } = loanRows(db, m.id);
  return {
    today: db.demo.today,
    currentCycle: db.currentCycle,
    loans,
    guarantees,
    deposits: db.deposits
      .filter((d) => d.memberId === m.id)
      .map(({ id, accountNo, scheme, status, balance, principal, monthlyAmount, ratePercent, maturityDate, openedOn }) => ({ id, accountNo, scheme, status, balance, ratePercent, openedOn, ...(principal !== undefined ? { principal } : {}), ...(monthlyAmount !== undefined ? { monthlyAmount } : {}), ...(maturityDate ? { maturityDate } : {}) })),
    shares: db.shareAccounts.find((s) => s.memberId === m.id) ?? null,
    ledger: db.demandSheets
      .flatMap((sh) => sh.lines.filter((l) => l.memberId === m.id).map((l) => ({ cycle: sh.cycle, departmentName: deptName(db, sh.departmentId), demand: l.totalDemand, ...(l.recovered !== undefined ? { recovered: l.recovered } : {}), sheetStatus: sh.status })))
      .sort((a, b) => b.cycle.localeCompare(a.cycle)),
    changeRequests: db.profileChangeRequests.filter((r) => r.memberId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    /** Demand cycles already generated for the member's department (BR-010 transfer timing). */
    demandCycles: db.demandSheets.filter((s) => s.departmentId === m.departmentId && s.status !== 'NOT_GENERATED').map((s) => s.cycle),
  };
}

/** Dev bridge: per-member loan totals and pending change requests for the backend's member list. */
export function legacyMembersSummary(db: Db) {
  const rows: Record<string, { activeLoans: number; outstanding: number; pendingChanges: number }> = {};
  for (const l of db.loans) {
    if (!OPEN_LOAN.has(l.status)) continue;
    const r = (rows[l.memberId] ??= { activeLoans: 0, outstanding: 0, pendingChanges: 0 });
    r.activeLoans++;
    r.outstanding += l.outstandingPrincipal;
  }
  const pending = db.profileChangeRequests.filter((r) => r.status === 'PENDING');
  for (const r of pending) (rows[r.memberId] ??= { activeLoans: 0, outstanding: 0, pendingChanges: 0 }).pendingChanges++;
  return { today: db.demo.today, currentCycle: db.currentCycle, rows, pendingChangeRequests: pending.map((r) => ({ id: r.id, memberId: r.memberId, route: r.route })) };
}

function memberDetail(db: Db, m: Member, user: SessionUser): MemberDetail {
  const today = db.demo.today;
  const mandate = currentMandate(db, m.id);
  const upcoming = db.transfers.filter((t) => t.memberId === m.id && t.effectiveCycle > db.currentCycle).at(-1);
  const expectedDor = expectedRetirementDate(m.dob, db.settings.retirementAge);
  const seeFullMobile = user.role === 'SUPER_ADMIN' || user.role === 'ACCOUNTANT';
  const ddoForMandate = mandate ? ddoLogin(db, mandate.departmentId) : undefined;
  const mandatePending = mandate?.status === 'PENDING_NEW_DDO';
  const { loans, guarantees } = loanRows(db, m.id);
  const ledger = db.demandSheets
    .flatMap((sh) => sh.lines.filter((l) => l.memberId === m.id).map((l) => ({ cycle: sh.cycle, departmentName: deptName(db, sh.departmentId), demand: l.totalDemand, ...(l.recovered !== undefined ? { recovered: l.recovered } : {}), sheetStatus: sh.status })))
    .sort((a, b) => b.cycle.localeCompare(a.cycle));
  return {
    member: seeFullMobile ? m : { ...m, mobile: m.mobileMasked },
    department: db.departments.find((d) => d.id === m.departmentId) ?? null,
    leftover: calculateLeftoverService(m.dor, today),
    ageYears: ageOn(m.dob, today),
    ...(m.dor !== expectedDor ? { dorWarning: `At retirement age ${db.settings.retirementAge} the date of retirement would be ${formatDisplayDate(expectedDor)}. Check the service record.` } : {}),
    shares: db.shareAccounts.find((s) => s.memberId === m.id) ?? null,
    loans,
    guarantees,
    deposits: db.deposits
      .filter((d) => d.memberId === m.id)
      .map(({ id, accountNo, scheme, status, balance, principal, monthlyAmount, ratePercent, maturityDate, openedOn }) => ({ id, accountNo, scheme, status, balance, ratePercent, openedOn, ...(principal !== undefined ? { principal } : {}), ...(monthlyAmount !== undefined ? { monthlyAmount } : {}), ...(maturityDate ? { maturityDate } : {}) })),
    serviceEvents: db.serviceEvents.filter((e) => e.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date)),
    mandate,
    ...(upcoming ? { upcomingTransfer: { ...upcoming, toDepartmentName: deptName(db, upcoming.toDepartmentId), fromDepartmentName: deptName(db, upcoming.fromDepartmentId) } } : {}),
    documents: documentsOf(m),
    changeRequests: db.profileChangeRequests.filter((r) => r.memberId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ledger,
    can: {
      edit: can(user, 'members.edit') && m.status === 'ACTIVE',
      transfer: can(user, 'members.edit') && m.status === 'ACTIVE',
      agreeMandate: mandatePending && user.role === 'DDO' && user.departmentId === mandate.departmentId,
      seeFullMobile,
    },
    ...(mandatePending && !ddoForMandate && can(user, 'demo.control') && user.role !== 'DDO' ? { demoAgreeAs: `${db.departments.find((d) => d.id === mandate.departmentId)?.ddoName ?? 'DDO'} (DDO, ${deptName(db, mandate.departmentId)})` } : {}),
  };
}

// ---- change requests ----------------------------------------------------------------------------

const needsDdo = (r: ProfileChangeRequest) => r.status === 'PENDING' && r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified;
const fieldLabels = (r: ProfileChangeRequest) => r.fields.map((f) => PROFILE_FIELDS[f.field].label.toLowerCase()).join(', ');

function changeRow(db: Db, r: ProfileChangeRequest, user: SessionUser): ChangeRequestRow {
  const m = db.members.find((x) => x.id === r.memberId)!;
  const dept = db.departments.find((d) => d.id === m.departmentId);
  const login = ddoLogin(db, m.departmentId);
  const accountant = db.staffUsers.find((u) => u.role === 'ACCOUNTANT');
  const ddoStep = needsDdo(r);
  const waitingOn = r.status !== 'PENDING' ? undefined : ddoStep ? `${login?.name ?? dept?.ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})` : `${accountant?.name ?? 'Accountant'} (Accountant)`;
  const myAction = r.status !== 'PENDING' ? undefined : ddoStep ? (user.role === 'DDO' && user.departmentId === m.departmentId ? 'certify' : undefined) : can(user, 'members.decideChanges') ? 'decide' : undefined;
  return {
    ...r,
    memberName: m.name,
    generalNo: m.generalNo,
    departmentId: m.departmentId,
    departmentName: dept?.name ?? '',
    ...(waitingOn ? { waitingOn } : {}),
    ...(myAction ? { myAction } : {}),
    ...(ddoStep && !login && can(user, 'demo.control') && user.role !== 'DDO' ? { demoCertifyAs: `${dept?.ddoName ?? 'DDO'} (DDO, ${dept?.name ?? ''})` } : {}),
  };
}

function changeVisible(db: Db, r: ProfileChangeRequest, user: SessionUser) {
  if (user.role !== 'DDO') return true;
  const m = db.members.find((x) => x.id === r.memberId);
  return r.route === 'DDO_THEN_OFFICE' && m?.departmentId === user.departmentId;
}

/** Accountant approval: writes the values, logs service events, tells the member. */
function applyApproved(store: Store, r: ProfileChangeRequest, byName: string) {
  const db = store.db;
  const idx = db.members.findIndex((m) => m.id === r.memberId);
  let m = db.members[idx]!;
  const today = db.demo.today;
  for (const f of r.fields) {
    m = applyProfileChange(m, f);
    const label = PROFILE_FIELDS[f.field].label;
    if (f.field === 'designation') addEvent(db, { memberId: m.id, type: 'DESIGNATION_CHANGED', date: today, summary: `Designation changed from ${f.oldValue} to ${f.newValue}`, byName });
    else if (f.field === 'dor') addEvent(db, { memberId: m.id, type: 'RETIREMENT_DATE_CHANGED', date: today, summary: `Date of retirement changed to ${formatDisplayDate(f.newValue)}`, byName });
    else addEvent(db, { memberId: m.id, type: 'PROFILE_UPDATED', date: today, summary: `${label} updated on request`, byName });
  }
  if (r.fields.some((f) => f.field.startsWith('payProfile.'))) m = { ...m, payProfile: { ...m.payProfile, certifiedAt: today } };
  db.members[idx] = m;
}

// ---- my profile (MB-02) -------------------------------------------------------------------------

function myProfile(db: Db, m: Member): MyProfile {
  const changeRequests = db.profileChangeRequests.filter((r) => r.memberId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    member: m,
    departmentName: deptName(db, m.departmentId),
    leftover: calculateLeftoverService(m.dor, db.demo.today),
    shares: db.shareAccounts.find((s) => s.memberId === m.id) ?? null,
    serviceEvents: db.serviceEvents.filter((e) => e.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date)),
    mandate: currentMandate(db, m.id),
    documents: documentsOf(m),
    changeRequests,
    pendingFields: changeRequests.filter((r) => r.status === 'PENDING').flatMap((r) => r.fields.map((f) => f.field)),
  };
}

function validateAddress(a: Address | undefined, prefix: string, e: Record<string, string>) {
  if (!a?.line1?.trim()) e[`${prefix}.line1`] = 'Required';
  if (!a?.city?.trim()) e[`${prefix}.city`] = 'Required';
  if (!/^\d{6}$/.test(a?.pincode ?? '')) e[`${prefix}.pincode`] = 'PIN code must be 6 digits';
}

// ---- routes -------------------------------------------------------------------------------------

export function registerMembers(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const staffView = (user: SessionUser) => {
    requireStaff(user);
    requirePermission(user, 'members.view', 'You do not have access to members.');
  };
  const load = (id: string, user: SessionUser) => {
    const m = db().members.find((x) => x.id === id || x.generalNo === id);
    if (!m || !visible(user, m)) return fail('NOT_FOUND', 'This member does not exist or is outside your department.');
    return m;
  };
  const otps = new Map<string, { memberId: string; mobile: string; expiresAt: number }>();

  // ---- ST-10 list ----------------------------------------------------------------------------
  api.get('/members', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const departmentId = c.req.query('departmentId');
    const status = c.req.query('status') ?? 'ACTIVE';
    const retiring = Number(c.req.query('retiringWithinMonths') ?? 0);
    const hasActiveLoan = c.req.query('hasActiveLoan') === 'true';
    const mandatePending = c.req.query('mandatePending') === 'true';
    const sort = c.req.query('sort') ?? 'generalNo';
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 25)));
    const page = Math.max(1, Number(c.req.query('page') ?? 1));

    const scoped = db().members.filter((m) => visible(user, m)).map((m) => toRow(db(), m));
    const rows = scoped.filter(
      (r) =>
        (status === 'ALL' || r.status === status) &&
        (!departmentId || r.departmentId === departmentId) &&
        (!retiring || (r.status === 'ACTIVE' && r.leftoverMonths <= retiring)) &&
        (!hasActiveLoan || r.activeLoans > 0) &&
        (!mandatePending || r.mandateStatus === 'PENDING_NEW_DDO') &&
        (!q || r.name.toLowerCase().includes(q) || r.generalNo.includes(q) || r.employeeId.toLowerCase().includes(q)),
    );
    const sorters: Record<string, (a: MemberRow, b: MemberRow) => number> = {
      generalNo: (a, b) => Number(a.generalNo) - Number(b.generalNo),
      name: (a, b) => a.name.localeCompare(b.name),
      dor: (a, b) => a.dor.localeCompare(b.dor),
      outstanding: (a, b) => b.outstanding - a.outstanding,
    };
    rows.sort(sorters[sort] ?? sorters.generalNo);
    const scopeIds = new Set(scoped.map((r) => r.id));
    const dept = user.role === 'DDO' && user.departmentId ? db().departments.find((d) => d.id === user.departmentId) : undefined;
    return c.json<MemberList>({
      asOf: db().demo.today,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
      counts: {
        all: scoped.length,
        active: scoped.filter((r) => r.status === 'ACTIVE').length,
        retiringSoon: scoped.filter((r) => r.status === 'ACTIVE' && r.leftoverMonths <= 6).length,
        mandatePending: scoped.filter((r) => r.mandateStatus === 'PENDING_NEW_DDO').length,
        changeRequests: db().profileChangeRequests.filter((r) => r.status === 'PENDING' && scopeIds.has(r.memberId) && changeVisible(db(), r, user)).length,
      },
      scope: dept ? { departmentId: dept.id, departmentName: dept.name } : {},
      canCreate: can(user, 'members.edit'),
    });
  });

  // ---- ST-12 profile -------------------------------------------------------------------------
  api.get('/members/:id', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    return c.json<MemberDetail>(memberDetail(db(), load(c.req.param('id'), user), user));
  });

  // ---- ST-11 create / edit -------------------------------------------------------------------
  const validated = (input: Partial<MemberInput>, selfId?: string) => {
    const s = db().settings;
    const fieldErrors = validateMemberInput(input, { today: db().demo.today, minShares: s.minShares, maxShares: s.maxShares, others: db().members, ...(selfId ? { selfId } : {}) });
    if (input.departmentId && !db().departments.some((d) => d.id === input.departmentId)) fieldErrors.departmentId = 'Unknown department';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    return input as MemberInput;
  };

  api.post('/members', requireSession, async (c) => {
    const user = c.get('session');
    requirePermission(user, 'members.edit', 'Only the Super Admin and the Accountant can add members.');
    const input = validated(await c.req.json<Partial<MemberInput>>().catch(() => ({})));
    const d = db();
    const generalNo = nextGeneralNo(d);
    const today = d.demo.today;
    const member: Member = {
      id: `mem-${generalNo}`,
      generalNo,
      employeeId: input.employeeId.trim(),
      name: input.name.trim(),
      fatherName: input.fatherName.trim(),
      gender: input.gender,
      dob: input.dob,
      mobile: input.mobile,
      mobileMasked: maskMobile(input.mobile),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      presentAddress: input.presentAddress,
      permanentAddress: input.permanentAddress,
      designation: input.designation,
      departmentId: input.departmentId,
      doj: input.doj,
      dor: input.dor,
      employmentType: input.employmentType,
      numberOfShares: input.numberOfShares,
      nominee: input.nominee,
      payProfile: { ...input.payProfile, certifiedAt: today },
      ...(input.anniversaryDate ? { anniversaryDate: input.anniversaryDate } : {}),
      status: 'ACTIVE',
      portalActivated: false,
      joinedSocietyOn: today,
    };
    d.members.push(member);
    d.shareAccounts.push({ memberId: member.id, numberOfShares: member.numberOfShares, shareCapital: member.numberOfShares * d.settings.shareValue, shareDepositBalance: 0 });
    // Office entry from the paper form: the F5 mandate already carries the DDO's signature.
    const dept = d.departments.find((x) => x.id === member.departmentId);
    d.mandates.push({ id: `mdt-${generalNo}-1`, memberId: member.id, departmentId: member.departmentId, status: 'AGREED', signedOn: today, agreedOn: today, agreedByName: dept?.ddoName ?? 'DDO' });
    addEvent(d, { memberId: member.id, type: 'JOINED', date: today, summary: `Joined the society (General No. ${generalNo}) from ${dept?.name ?? ''} as ${member.designation}`, byName: user.name });
    audit(store, user, 'member', member.id, 'create', `Added member ${member.name} (General No. ${generalNo})`);
    store.save();
    return c.json<MemberDetail>(memberDetail(d, member, user), 201);
  });

  api.put('/members/:id', requireSession, async (c) => {
    const user = c.get('session');
    requirePermission(user, 'members.edit', 'Only the Super Admin and the Accountant can edit members.');
    const d = db();
    const current = load(c.req.param('id'), user);
    if (current.status !== 'ACTIVE') fail('RULE_VIOLATION', 'Only active members can be edited.');
    const body = await c.req.json<Partial<MemberInput>>().catch(() => ({}) as Partial<MemberInput>);
    if (body.departmentId && body.departmentId !== current.departmentId) fail('VALIDATION_ERROR', 'Use Transfer to change the department.', { fieldErrors: { departmentId: 'Use Transfer to change the department (ST-13)' } });
    // Shares change through a share purchase, not an edit: keep the current number.
    const input = validated({ ...body, departmentId: current.departmentId, numberOfShares: current.numberOfShares }, current.id);
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
    const today = d.demo.today;
    if (current.designation !== next.designation) addEvent(d, { memberId: current.id, type: 'DESIGNATION_CHANGED', date: today, summary: `Designation changed from ${current.designation} to ${next.designation}`, byName: user.name });
    if (current.dor !== next.dor) addEvent(d, { memberId: current.id, type: 'RETIREMENT_DATE_CHANGED', date: today, summary: `Date of retirement changed to ${formatDisplayDate(next.dor)}`, byName: user.name });
    const other = changed.filter((k) => k !== 'designation' && k !== 'dor');
    if (other.length) addEvent(d, { memberId: current.id, type: 'PROFILE_UPDATED', date: today, summary: `Profile edited by the office (${other.join(', ')})`, byName: user.name });
    d.members[d.members.indexOf(current)] = next;
    if (changed.length) audit(store, user, 'member', current.id, 'update', `Edited ${next.name}: ${changed.join(', ')}`);
    store.save();
    return c.json<MemberDetail>(memberDetail(d, next, user));
  });

  // ---- ST-13 transfer (BR-010, BR-028) -------------------------------------------------------
  api.post('/members/:id/transfers', requireSession, async (c) => {
    const user = c.get('session');
    requirePermission(user, 'members.edit', 'Only the Super Admin and the Accountant can transfer members.');
    const d = db();
    const m = load(c.req.param('id'), user);
    if (m.status !== 'ACTIVE') fail('RULE_VIOLATION', 'Only active members can be transferred.');
    const input = await c.req.json<Partial<TransferInput>>().catch(() => ({}) as Partial<TransferInput>);
    const fieldErrors: Record<string, string> = {};
    const to = d.departments.find((x) => x.id === input.toDepartmentId);
    if (!to) fieldErrors.toDepartmentId = 'Choose the new department';
    else if (to.id === m.departmentId) fieldErrors.toDepartmentId = 'The member is already in this department';
    if (!input.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) fieldErrors.effectiveDate = 'Enter the date the transfer takes effect';
    else if (input.effectiveDate < m.joinedSocietyOn) fieldErrors.effectiveDate = 'Cannot be before the member joined the society';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const generated = d.demandSheets.filter((s) => s.departmentId === m.departmentId && s.status !== 'NOT_GENERATED').map((s) => s.cycle);
    const effectiveCycle = transferEffectiveCycle(input.effectiveDate!, generated);
    const from = m.departmentId;
    const recordedAt = nowIso();
    const transfer = { id: `trf-${randomUUID().slice(0, 8)}`, memberId: m.id, fromDepartmentId: from, toDepartmentId: to!.id, effectiveCycle, effectiveDate: input.effectiveDate!, orderRef: input.orderRef?.trim() || '—', ...(input.remarks?.trim() ? { remarks: input.remarks.trim() } : {}), recordedAt, recordedByName: user.name };
    d.transfers.push(transfer);
    m.departmentId = to!.id;
    // The salary-recovery mandate must be agreed again by the new DDO (BR-028).
    for (const x of d.mandates) if (x.memberId === m.id && x.status !== 'SUPERSEDED') x.status = 'SUPERSEDED';
    d.mandates.push({ id: `mdt-${m.generalNo}-${randomUUID().slice(0, 6)}`, memberId: m.id, departmentId: to!.id, status: 'PENDING_NEW_DDO', signedOn: d.demo.today });
    addEvent(d, { memberId: m.id, type: 'TRANSFERRED', date: d.demo.today, effectiveCycle, summary: `Transferred from ${deptName(d, from)} to ${to!.name}${input.orderRef?.trim() ? ` (order ${input.orderRef.trim()})` : ''}. On the ${to!.name} demand sheet from ${formatCycle(effectiveCycle)}`, byName: user.name });
    audit(store, user, 'member', m.id, 'transfer', `${m.name}: ${deptName(d, from)} → ${to!.name} from ${formatCycle(effectiveCycle)}`);
    store.save();
    return c.json<MemberDetail>(memberDetail(d, m, user));
  });

  api.post('/members/:id/mandate/agree', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    const d = db();
    const m = load(c.req.param('id'), user);
    const mandate = currentMandate(d, m.id);
    if (!mandate || mandate.status !== 'PENDING_NEW_DDO') return fail('INVALID_TRANSITION', 'Nothing to agree: the mandate is not waiting for a DDO.');
    const login = ddoLogin(d, mandate.departmentId);
    const dept = d.departments.find((x) => x.id === mandate.departmentId);
    let byName: string;
    if (user.role === 'DDO' && user.departmentId === mandate.departmentId) byName = user.name;
    else if (!login && can(user, 'demo.control') && user.role !== 'DDO') byName = dept?.ddoName ?? 'DDO';
    else return fail('FORBIDDEN', `Waiting for ${login?.name ?? dept?.ddoName ?? 'the DDO'} (DDO, ${dept?.name ?? ''}) to agree.`);
    Object.assign(mandate, { status: 'AGREED', agreedOn: d.demo.today, agreedByName: byName });
    audit(store, user, 'mandate', mandate.id, 'agree', `${byName} agreed the salary recovery mandate for ${m.name}`);
    store.save();
    return c.json<MemberDetail>(memberDetail(d, m, user));
  });

  // ---- ST-18 change requests -----------------------------------------------------------------
  const listChanges = (user: SessionUser): ChangeRequestList => {
    const rows = db()
      .profileChangeRequests.filter((r) => changeVisible(db(), r, user))
      .map((r) => changeRow(db(), r, user))
      .sort((a, b) => Number(!!b.myAction) - Number(!!a.myAction) || Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.createdAt.localeCompare(a.createdAt));
    return { rows, counts: { pending: rows.filter((r) => r.status === 'PENDING').length, waitingOnMe: rows.filter((r) => r.myAction).length } };
  };
  const loadChange = (id: string, user: SessionUser) => {
    const r = db().profileChangeRequests.find((x) => x.id === id);
    if (!r || !changeVisible(db(), r, user)) return fail('NOT_FOUND', 'This request does not exist or is outside your department.');
    if (r.status !== 'PENDING') fail('INVALID_TRANSITION', 'This request has already been decided.');
    return r;
  };

  api.get('/profile-change-requests', requireSession, (c) => {
    const user = c.get('session');
    staffView(user);
    return c.json<ChangeRequestList>(listChanges(user));
  });

  api.post('/profile-change-requests/:id/certify', requireSession, async (c) => {
    const user = c.get('session');
    staffView(user);
    const r = loadChange(c.req.param('id'), user);
    const d = db();
    const m = d.members.find((x) => x.id === r.memberId)!;
    if (!needsDdo(r)) fail('INVALID_TRANSITION', 'This request does not need the DDO.');
    const login = ddoLogin(d, m.departmentId);
    const dept = d.departments.find((x) => x.id === m.departmentId);
    let byName: string;
    if (user.role === 'DDO' && user.departmentId === m.departmentId) byName = user.name;
    else if (!login && can(user, 'demo.control') && user.role !== 'DDO') byName = dept?.ddoName ?? 'DDO';
    else return fail('FORBIDDEN', `Only ${login?.name ?? 'the department DDO'} can certify this.`);
    const { approve = true, remarks } = await c.req.json<{ approve?: boolean; remarks?: string }>().catch(() => ({}) as { approve?: boolean; remarks?: string });
    if (!approve && !remarks?.trim()) fail('VALIDATION_ERROR', 'Give a reason.', { fieldErrors: { remarks: 'Tell the member what is wrong' } });
    const at = nowIso();
    if (approve) r.ddoCertified = { byName, at, ...(remarks?.trim() ? { remarks: remarks.trim() } : {}) };
    else {
      Object.assign(r, { status: 'REJECTED', decidedByName: `${byName} (DDO)`, decidedAt: at, remarks: remarks!.trim() });
      notify(store, m.id, 'profile.rejected', { fields: fieldLabels(r), reason: remarks!.trim() }, '/profile');
    }
    audit(store, user, 'profileChange', r.id, approve ? 'certify' : 'reject', `${byName} ${approve ? 'certified' : 'did not certify'} ${m.name}'s ${fieldLabels(r)}`);
    store.save();
    return c.json<ChangeRequestRow>(changeRow(d, r, user));
  });

  api.post('/profile-change-requests/:id/decision', requireSession, async (c) => {
    const user = c.get('session');
    staffView(user);
    requirePermission(user, 'members.decideChanges', 'Only the Accountant decides profile changes.');
    const r = loadChange(c.req.param('id'), user);
    if (needsDdo(r)) fail('INVALID_TRANSITION', 'Waiting for the DDO to certify the employment / pay details first.');
    const { approve, remarks } = await c.req.json<{ approve?: boolean; remarks?: string }>().catch(() => ({}) as { approve?: boolean; remarks?: string });
    if (approve === undefined) fail('VALIDATION_ERROR', 'Approve or reject.');
    if (!approve && !remarks?.trim()) fail('VALIDATION_ERROR', 'Give a reason.', { fieldErrors: { remarks: 'Tell the member why' } });
    const at = nowIso();
    Object.assign(r, { status: approve ? 'APPROVED' : 'REJECTED', decidedByName: user.name, decidedAt: at, ...(remarks?.trim() ? { remarks: remarks.trim() } : {}) });
    if (approve) applyApproved(store, r, user.name);
    notify(store, r.memberId, approve ? 'profile.approved' : 'profile.rejected', { fields: fieldLabels(r), reason: remarks?.trim() ?? '' }, '/profile');
    audit(store, user, 'profileChange', r.id, approve ? 'approve' : 'reject', `${approve ? 'Approved' : 'Rejected'} change of ${fieldLabels(r)} for General No. ${db().members.find((m) => m.id === r.memberId)?.generalNo}`);
    store.save();
    return c.json<ChangeRequestRow>(changeRow(db(), r, user));
  });

  // ---- MB-02 / MB-19 (member) ----------------------------------------------------------------
  const mine = (user: SessionUser) => {
    const id = requireMember(user);
    return db().members.find((m) => m.id === id) ?? fail('NOT_FOUND', 'Member record not found.');
  };

  api.get('/me/profile', requireSession, (c) => c.json<MyProfile>(myProfile(db(), mine(c.get('session')))));

  api.patch('/me/profile/contact', requireSession, async (c) => {
    const user = c.get('session');
    const m = mine(user);
    const body = await c.req.json<ContactUpdateInput>().catch(() => ({}) as ContactUpdateInput);
    const fieldErrors: Record<string, string> = {};
    if (body.email !== undefined && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) fieldErrors.email = 'Enter a valid email or leave it blank';
    if (body.presentAddress) validateAddress(body.presentAddress, 'presentAddress', fieldErrors);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const parts: string[] = [];
    if (body.email !== undefined && body.email.trim() !== (m.email ?? '')) {
      if (body.email.trim()) m.email = body.email.trim();
      else delete m.email;
      parts.push('email');
    }
    if (body.presentAddress && JSON.stringify(body.presentAddress) !== JSON.stringify(m.presentAddress)) {
      m.presentAddress = body.presentAddress;
      parts.push('present address');
    }
    if (parts.length) {
      addEvent(db(), { memberId: m.id, type: 'PROFILE_UPDATED', date: db().demo.today, summary: `Updated ${parts.join(' and ')} in the app`, byName: m.name });
      audit(store, user, 'member', m.id, 'contact', `${m.name} updated ${parts.join(', ')}`);
      store.save();
    }
    return c.json<MyProfile>(myProfile(db(), m));
  });

  api.post('/me/profile/mobile', requireSession, async (c) => {
    const m = mine(c.get('session'));
    const { mobile = '' } = await c.req.json<{ mobile?: string }>().catch(() => ({}) as { mobile?: string });
    if (!MOBILE_PATTERN.test(mobile)) fail('VALIDATION_ERROR', 'Enter a 10-digit mobile number.', { fieldErrors: { mobile: 'Enter a 10-digit mobile number' } });
    if (mobile === m.mobile) fail('VALIDATION_ERROR', 'This is already your number.', { fieldErrors: { mobile: 'This is already your number' } });
    if (db().members.some((x) => x.mobile === mobile && x.id !== m.id)) fail('ALREADY_EXISTS', 'This number belongs to another member.', { fieldErrors: { mobile: 'Used by another member' } });
    const otpRef = randomUUID();
    otps.set(otpRef, { memberId: m.id, mobile, expiresAt: Date.now() + 300_000 });
    return c.json<OtpChallenge>({ otpRef, expiresInSeconds: 300, demoOtp: DEMO_OTP });
  });

  api.post('/me/profile/mobile/verify', requireSession, async (c) => {
    const user = c.get('session');
    const m = mine(user);
    const { otpRef = '', otp } = await c.req.json<{ otpRef?: string; otp?: string }>().catch(() => ({}) as { otpRef?: string; otp?: string });
    const pending = otps.get(otpRef);
    if (!pending || pending.memberId !== m.id || Date.now() > pending.expiresAt) fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    if (otp !== DEMO_OTP) fail('VALIDATION_ERROR', "That code doesn't match. Check the SMS and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    otps.delete(otpRef);
    m.mobile = pending!.mobile;
    m.mobileMasked = maskMobile(m.mobile);
    addEvent(db(), { memberId: m.id, type: 'PROFILE_UPDATED', date: db().demo.today, summary: `Mobile number changed to ${m.mobileMasked} (verified by OTP)`, byName: m.name });
    audit(store, user, 'member', m.id, 'mobile', `${m.name} changed mobile (OTP verified)`);
    store.save();
    return c.json<MyProfile>(myProfile(db(), m));
  });

  api.get('/me/profile/change-requests', requireSession, (c) => c.json<ProfileChangeRequest[]>(myProfile(db(), mine(c.get('session'))).changeRequests));

  api.post('/me/profile/change-requests', requireSession, async (c) => {
    const user = c.get('session');
    const m = mine(user);
    const body = await c.req.json<Partial<ChangeRequestInput>>().catch(() => ({}) as Partial<ChangeRequestInput>);
    const input = { fields: body.fields ?? [], reason: body.reason ?? '' };
    const pendingFields: ProfileField[] = myProfile(db(), m).pendingFields;
    const fieldErrors = validateChangeRequest(m, input, pendingFields, db().demo.today);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const fields = input.fields.map(({ field, newValue }) => ({ field, oldValue: profileFieldValue(m, field), newValue: newValue.trim() }));
    const request: ProfileChangeRequest = {
      id: `pcr-${randomUUID().slice(0, 8)}`,
      memberId: m.id,
      fields,
      reason: input.reason.trim(),
      ...(body.documentName?.trim() ? { documentName: body.documentName.trim() } : {}),
      route: changeRequestRoute(fields.map((f) => f.field)),
      status: 'PENDING',
      createdAt: nowIso(),
    };
    db().profileChangeRequests.push(request);
    audit(store, user, 'profileChange', request.id, 'request', `${m.name} asked to change ${fieldLabels(request)}`);
    store.save();
    return c.json<ProfileChangeRequest>(request, 201);
  });
}
