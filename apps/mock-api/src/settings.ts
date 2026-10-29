// M2 Settings & masters (ST-60 … ST-67) + the members' rate card (MB-16).
// Reads need `settings.view`; changes need `settings.edit` (users: `users.manage`). Every change
// is validated by @tgs/domain and written to the audit log. Editing a placeholder value marks it
// as confirmed (it leaves `settings.placeholders`).
import { validateFdSlabs, validateLoanProduct, validateSocietySettings } from '@tgs/domain';
import { NOTIFICATION_TEMPLATES } from '@tgs/mock-data';
import {
  CONSOLE_ROLES,
  ROLE_LABELS,
  type Department,
  type DepartmentRow,
  type LoanProduct,
  type LoanProductCode,
  type NotificationTemplate,
  type Permission,
  type PermissionMatrix,
  type RatesReference,
  type SettingsBundle,
  type SocietyProfile,
  type SocietySettings,
  type StaffUser,
} from '@tgs/types';
import { audit, can, requirePermission, requireStaff, type Api, type Guard } from './common';
import { fail } from './errors';
import { PERMISSION_LABELS, ROLE_PERMISSIONS } from '@tgs/domain';
import type { Store } from './store';

// PERMISSION_LABELS moved to @tgs/domain (D-076).

/** Which settings keys a payload touched (for placeholders + audit text). */
const keysOf = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]));

const SETTINGS_KEYS: Array<keyof SocietySettings> = [
  'shareValue', 'admissionFee', 'minShares', 'maxShares', 'retirementAge', 'financialYearStartMonth', 'maxGuaranteesPerSurety', 'emiToNetSalaryMaxPercent',
  'insurance', 'rrfMonthly', 'crdMonthly', 'srdsMonthly', 'defaulterCycles', 'fdSlabs', 'fdMinAmount', 'savingsRatePercent', 'crdRatePercent', 'srdsRatePercent', 'penalGraceDays',
];

export function ratesReference(store: Store): RatesReference {
  const db = store.db;
  const last = db.auditLog.find((a) => a.entity === 'settings' || a.entity === 'loanProduct');
  return {
    loanProducts: db.loanProducts.map(({ code, name, ratePercent, minAmount, maxAmount, maxInstalments, emiMethod, suretiesRequired, shareDepositPercent, placeholder }) => ({ code, name, ratePercent, minAmount, maxAmount, maxInstalments, emiMethod, suretiesRequired, shareDepositPercent, placeholder })),
    fdSlabs: db.settings.fdSlabs,
    savingsRatePercent: db.settings.savingsRatePercent,
    crdRatePercent: db.settings.crdRatePercent,
    srdsRatePercent: db.settings.srdsRatePercent,
    ...(last ? { updatedAt: last.at } : {}),
  };
}

export function registerSettings(api: Api, store: Store, requireSession: Guard) {
  const db = () => store.db;
  const editGuard = (c: { get: (k: 'session') => import('@tgs/types').SessionUser }) => {
    const user = c.get('session');
    requirePermission(user, 'settings.edit', 'Only the Super Admin can change settings.');
    return user;
  };
  const bundle = (user: import('@tgs/types').SessionUser): SettingsBundle => ({
    society: db().society,
    settings: db().settings,
    loanProducts: db().loanProducts,
    recentChanges: db().auditLog.filter((a) => ['settings', 'loanProduct', 'society', 'department', 'user', 'template'].includes(a.entity)).slice(0, 12),
    canEdit: can(user, 'settings.edit'),
  });

  // ---- ST-60, ST-64 … ST-66 ---------------------------------------------------------------------
  api.get('/settings', requireSession, (c) => {
    const user = c.get('session');
    requirePermission(user, 'settings.view');
    return c.json(bundle(user));
  });

  api.put('/settings/society', requireSession, async (c) => {
    const user = editGuard(c);
    const body = await c.req.json<Partial<SocietyProfile>>();
    const next = { ...db().society, ...body };
    const fieldErrors: Record<string, string> = {};
    if (!next.name?.trim()) fieldErrors.name = 'Enter the registered name.';
    if (!next.shortName?.trim()) fieldErrors.shortName = 'Enter the short name.';
    if (!next.registrationNo?.trim()) fieldErrors.registrationNo = 'Enter the registration number.';
    if (!next.address?.trim()) fieldErrors.address = 'Enter the address.';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    db().society = { name: next.name.trim(), shortName: next.shortName.trim(), registrationNo: next.registrationNo.trim(), address: next.address.trim() };
    audit(store, user, 'society', 'profile', 'update', 'Updated the society profile');
    store.save();
    return c.json(bundle(user));
  });

  api.put('/settings/values', requireSession, async (c) => {
    const user = editGuard(c);
    const body = await c.req.json<Partial<SocietySettings>>();
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => (SETTINGS_KEYS as string[]).includes(k))) as Partial<SocietySettings>;
    const next: SocietySettings = { ...db().settings, ...patch, insurance: { ...db().settings.insurance, ...patch.insurance } };
    const fieldErrors = { ...validateSocietySettings(next), ...(patch.fdSlabs ? validateFdSlabs(next.fdSlabs) : {}) };
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const touched = keysOf(patch);
    next.placeholders = db().settings.placeholders.filter((p) => !touched.some((t) => t === p || t.startsWith(`${p}.`) || p.startsWith(`${t}.`)));
    db().settings = next;
    audit(store, user, 'settings', 'society', 'update', `Changed ${touched.map((t) => t.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);
    store.save();
    return c.json(bundle(user));
  });

  api.put('/settings/loan-products/:code', requireSession, async (c) => {
    const user = editGuard(c);
    const code = c.req.param('code') as LoanProductCode;
    const current = db().loanProducts.find((p) => p.code === code) ?? fail('NOT_FOUND', 'Unknown loan product.');
    const body = await c.req.json<Partial<LoanProduct>>();
    const { code: _ignored, ...rest } = body;
    const next: LoanProduct = { ...current, ...rest, code, placeholder: false };
    const fieldErrors = validateLoanProduct(next);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    db().loanProducts = db().loanProducts.map((p) => (p.code === code ? next : p));
    const changed = Object.keys(rest).filter((k) => rest[k as keyof typeof rest] !== current[k as keyof LoanProduct]);
    audit(store, user, 'loanProduct', code, 'update', `${current.name}: ${changed.length ? changed.join(', ') : 'confirmed'}${rest.ratePercent !== undefined && rest.ratePercent !== current.ratePercent ? ` (rate ${current.ratePercent}% → ${rest.ratePercent}%)` : ''}`);
    store.save();
    return c.json(bundle(user));
  });

  // ---- ST-67 departments & DDOs --------------------------------------------------------------------
  const deptRows = (): DepartmentRow[] =>
    db().departments.map((d) => ({
      ...d,
      memberCount: db().members.filter((m) => m.departmentId === d.id && m.status === 'ACTIVE').length,
      ...(db().staffUsers.find((u) => u.role === 'DDO' && u.departmentId === d.id) ? { ddoUserId: db().staffUsers.find((u) => u.role === 'DDO' && u.departmentId === d.id)!.id } : {}),
    }));

  api.get('/departments', requireSession, (c) => {
    requireStaff(c.get('session'));
    return c.json(deptRows());
  });

  const validateDept = (d: Partial<Department>, id?: string) => {
    const fieldErrors: Record<string, string> = {};
    if (!d.name?.trim()) fieldErrors.name = 'Enter the department name.';
    if (!d.code?.trim() || !/^[A-Z0-9]{2,8}$/.test(d.code.trim().toUpperCase())) fieldErrors.code = 'Use 2–8 letters or digits.';
    else if (db().departments.some((x) => x.code === d.code!.trim().toUpperCase() && x.id !== id)) fieldErrors.code = 'This code is already used.';
    if (!d.ddoName?.trim()) fieldErrors.ddoName = "Enter the DDO's name.";
    if (!d.ddoDesignation?.trim()) fieldErrors.ddoDesignation = "Enter the DDO's designation.";
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
  };

  api.post('/departments', requireSession, async (c) => {
    const user = editGuard(c);
    const body = await c.req.json<Partial<Department>>();
    validateDept(body);
    const code = body.code!.trim().toUpperCase();
    const dept: Department = { id: `dept-${code.toLowerCase()}`, code, name: body.name!.trim(), kind: body.kind === 'EXTERNAL_OFFICE' ? 'EXTERNAL_OFFICE' : 'SECRETARY_DEPT', ddoName: body.ddoName!.trim(), ddoDesignation: body.ddoDesignation!.trim() };
    db().departments.push(dept);
    audit(store, user, 'department', dept.id, 'create', `Added ${dept.name}`);
    store.save();
    return c.json(deptRows());
  });

  api.put('/departments/:id', requireSession, async (c) => {
    const user = editGuard(c);
    const id = c.req.param('id');
    const current = db().departments.find((d) => d.id === id) ?? fail('NOT_FOUND', 'Unknown department.');
    const body = await c.req.json<Partial<Department>>();
    const next = { ...current, ...body, id, code: (body.code ?? current.code).trim().toUpperCase() };
    validateDept(next, id);
    Object.assign(current, { name: next.name.trim(), code: next.code, kind: next.kind, ddoName: next.ddoName.trim(), ddoDesignation: next.ddoDesignation.trim() });
    audit(store, user, 'department', id, 'update', `Updated ${current.name}`);
    store.save();
    return c.json(deptRows());
  });

  // ---- ST-61 users ---------------------------------------------------------------------------------
  api.get('/users', requireSession, (c) => {
    requirePermission(c.get('session'), 'settings.view');
    return c.json(db().staffUsers);
  });

  const validateUser = (u: Partial<StaffUser>, id?: string) => {
    const fieldErrors: Record<string, string> = {};
    if (!u.name?.trim()) fieldErrors.name = 'Enter the full name.';
    if (!u.userId?.trim() || !/^[a-z0-9.]{3,24}$/.test(u.userId.trim())) fieldErrors.userId = 'Use 3–24 lowercase letters, digits or dots.';
    else if (db().staffUsers.some((x) => x.userId === u.userId!.trim() && x.id !== id)) fieldErrors.userId = 'This user ID is taken.';
    if (!u.role || !(CONSOLE_ROLES as readonly string[]).includes(u.role)) fieldErrors.role = 'Choose a role.';
    if (u.role === 'DDO' && !db().departments.some((d) => d.id === u.departmentId)) fieldErrors.departmentId = 'A DDO needs a department.';
    if (u.mobile && !/^[6-9]\d{9}$/.test(u.mobile)) fieldErrors.mobile = 'Enter a 10-digit mobile number.';
    if (u.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) fieldErrors.email = 'Enter a valid email.';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
  };
  const usersGuard = (c: { get: (k: 'session') => import('@tgs/types').SessionUser }) => {
    const user = c.get('session');
    requirePermission(user, 'users.manage', 'Only the Super Admin can manage users.');
    return user;
  };

  api.post('/users', requireSession, async (c) => {
    const user = usersGuard(c);
    const body = await c.req.json<Partial<StaffUser>>();
    validateUser(body);
    const created: StaffUser = {
      id: `stf-${body.userId!.trim().replace(/\./g, '-')}`,
      name: body.name!.trim(),
      userId: body.userId!.trim(),
      role: body.role!,
      ...(body.role === 'DDO' ? { departmentId: body.departmentId! } : {}),
      ...(body.email ? { email: body.email } : {}),
      ...(body.mobile ? { mobile: body.mobile } : {}),
      active: true,
    };
    db().staffUsers.push(created);
    audit(store, user, 'user', created.id, 'create', `Added ${created.name} (${ROLE_LABELS[created.role]})`);
    store.save();
    return c.json(db().staffUsers);
  });

  api.put('/users/:id', requireSession, async (c) => {
    const user = usersGuard(c);
    const id = c.req.param('id');
    const current = db().staffUsers.find((u) => u.id === id) ?? fail('NOT_FOUND', 'Unknown user.');
    const body = await c.req.json<Partial<StaffUser>>();
    const next = { ...current, ...body, id };
    validateUser(next, id);
    if (id === user.id && next.active === false) fail('VALIDATION_ERROR', 'You cannot deactivate yourself.', { fieldErrors: { active: 'You cannot deactivate yourself.' } });
    Object.assign(current, { name: next.name.trim(), userId: next.userId.trim(), role: next.role, active: next.active !== false, email: next.email || undefined, mobile: next.mobile || undefined });
    if (next.role === 'DDO') current.departmentId = next.departmentId;
    else delete current.departmentId;
    audit(store, user, 'user', id, current.active === false ? 'deactivate' : 'update', `${current.active === false ? 'Deactivated' : 'Updated'} ${current.name}`);
    store.save();
    return c.json(db().staffUsers);
  });

  // ---- ST-62 permissions (read-only in the prototype: SOD is fixed by role, BR-019) -------------------
  api.get('/permissions', requireSession, (c) => {
    requirePermission(c.get('session'), 'settings.view');
    return c.json<PermissionMatrix>({
      roles: CONSOLE_ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })),
      permissions: PERMISSION_LABELS,
      grants: Object.fromEntries(CONSOLE_ROLES.map((r) => [r, ROLE_PERMISSIONS[r]])),
    });
  });

  // ---- ST-63 notification templates ------------------------------------------------------------------
  api.get('/notification-templates', requireSession, (c) => {
    requirePermission(c.get('session'), 'settings.view');
    return c.json(db().notificationTemplates);
  });

  api.put('/notification-templates/:key', requireSession, async (c) => {
    const user = editGuard(c);
    const key = c.req.param('key');
    const current = db().notificationTemplates.find((t) => t.key === key) ?? fail('NOT_FOUND', 'Unknown template.');
    const body = await c.req.json<Partial<NotificationTemplate>>();
    const fieldErrors: Record<string, string> = {};
    const title = (body.title ?? current.title).trim();
    const text = (body.body ?? current.body).trim();
    const channels = body.channels ?? current.channels;
    if (!title) fieldErrors.title = 'Enter a title.';
    if (text.length < 10) fieldErrors.body = 'Write at least 10 characters.';
    if (!channels.length) fieldErrors.channels = 'Pick at least one channel.';
    const seed = NOTIFICATION_TEMPLATES.find((t) => t.key === key);
    const allowed = new Set([...`${seed?.title ?? ''} ${seed?.body ?? ''}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    const unknown = [...`${title} ${text}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !allowed.has(v));
    if (unknown.length) fieldErrors.body = `Unknown placeholder: {${unknown[0]}}. Use the ones listed.`;
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    Object.assign(current, { title, body: text, channels });
    audit(store, user, 'template', key, 'update', `Edited "${current.event}"`);
    store.save();
    return c.json(db().notificationTemplates);
  });

  // ---- MB-16 rate card (any signed-in user) -------------------------------------------------------------
  api.get('/reference/rates', requireSession, (c) => c.json(ratesReference(store)));
}
