import { validateFdSlabs, validateLoanProduct, validateSocietySettings } from '@tgs/domain';
import { NOTIFICATION_TEMPLATES } from '@tgs/mock-data';
import type { AuditEntry, LoanProduct, LoanProductCode, NotificationTemplate, RatesReference, SessionUser, SettingsBundle, SocietyProfile, SocietySettings } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { withTransaction } from '../../db/transaction';
import type { MastersRepository, ProductRow, SettingsRow, TemplateRow } from './masters.repository';

/** Audit entities shown in ST-60 "recent changes" (same set as the mock API). */
const CHANGE_ENTITIES = ['settings', 'loanProduct', 'society', 'department', 'user', 'template'];

/** Society settings keys a client may change (anything else in the body is ignored). */
const SETTINGS_KEYS: Array<keyof SocietySettings> = [
  'shareValue', 'admissionFee', 'minShares', 'maxShares', 'retirementAge', 'financialYearStartMonth', 'maxGuaranteesPerSurety', 'emiToNetSalaryMaxPercent',
  'insurance', 'rrfMonthly', 'crdMonthly', 'srdsMonthly', 'defaulterCycles', 'fdSlabs', 'fdMinAmount', 'savingsRatePercent', 'crdRatePercent', 'srdsRatePercent', 'penalGraceDays',
];

const PRODUCT_FIELDS: Array<keyof LoanProduct> = [
  'name', 'ratePercent', 'minAmount', 'maxAmount', 'maxInstalments', 'maxConcurrent', 'depositMarginPercent', 'penalRatePercent',
  'suretiesRequired', 'ddoCertificationRequired', 'shareDepositPercent', 'topupAllowed', 'emiMethod',
];

/** A settings change: any subset of keys, and any subset of the insurance amounts. */
export type SettingsPatch = Partial<Omit<SocietySettings, 'insurance'>> & { insurance?: Partial<SocietySettings['insurance']> };

/** Every leaf key a patch touches, e.g. insurance.loaneeAmount. */
const keysOf = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]));

export function toLoanProduct(r: ProductRow): LoanProduct {
  return {
    code: r.code, name: r.name, ratePercent: r.ratePercent, minAmount: r.minAmount, maxAmount: r.maxAmount, maxInstalments: r.maxInstalments,
    maxConcurrent: r.maxConcurrent, depositMarginPercent: r.depositMarginPercent, penalRatePercent: r.penalRatePercent, suretiesRequired: r.suretiesRequired,
    ddoCertificationRequired: r.ddoCertificationRequired, shareDepositPercent: r.shareDepositPercent, topupAllowed: r.topupAllowed, emiMethod: r.emiMethod, placeholder: r.placeholder,
  };
}

const PRODUCT_ORDER: LoanProductCode[] = ['ORDINARY', 'EDUCATION', 'SALARY', 'DEPOSIT'];
const byProductOrder = (a: LoanProduct, b: LoanProduct) => PRODUCT_ORDER.indexOf(a.code) - PRODUCT_ORDER.indexOf(b.code);

const toTemplate = (t: TemplateRow): NotificationTemplate => ({ key: t.key, event: t.event, title: t.title, body: t.body, channels: t.channels, audience: t.audience });

/**
 * ST-60…66 master files (REQ-130). Settings and loan products are versioned: every change is a new
 * ACTIVE version; the old one is kept. Business validation comes from @tgs/domain (same as the mock).
 */
export class MastersService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: MastersRepository,
  ) {}

  // ---- reads used by other modules (P4–P7) ----
  async settings(): Promise<SocietySettings> {
    return (await this.activeSettingsRow()).data;
  }

  async loanProducts(): Promise<LoanProduct[]> {
    return (await this.repo.activeProducts()).map(toLoanProduct).sort(byProductOrder);
  }

  // ---- ST-60 bundle ----
  async bundle(user: SessionUser): Promise<SettingsBundle> {
    const [society, settings, loanProducts, recentChanges, canEdit] = await Promise.all([
      this.society(),
      this.settings(),
      this.loanProducts(),
      this.recentChanges(),
      this.app.permissions.has(user.role, 'settings.edit'),
    ]);
    return { society, settings, loanProducts, recentChanges, canEdit };
  }

  async updateSociety(request: FastifyRequest, body: Partial<SocietyProfile>): Promise<SettingsBundle> {
    const user = sessionOf(request);
    const next = { ...(await this.society()), ...body };
    const fieldErrors: Record<string, string> = {};
    if (!next.name?.trim()) fieldErrors.name = 'Enter the registered name.';
    if (!next.shortName?.trim()) fieldErrors.shortName = 'Enter the short name.';
    if (!next.registrationNo?.trim()) fieldErrors.registrationNo = 'Enter the registration number.';
    if (!next.address?.trim()) fieldErrors.address = 'Enter the address.';
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.updateSociety(tx, { name: next.name.trim(), shortName: next.shortName.trim(), registrationNo: next.registrationNo.trim(), address: next.address.trim(), updatedBy: user.id });
      await this.app.audit.record(request, { action: 'update', entity: 'society', entityId: 'profile', summary: 'Updated the society profile', after: next }, tx);
    });
    return this.bundle(user);
  }

  /** ST-65/66: a new settings version from the changed keys. */
  async updateSettings(request: FastifyRequest, body: SettingsPatch): Promise<SettingsBundle> {
    const user = sessionOf(request);
    const current = await this.activeSettingsRow();
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => (SETTINGS_KEYS as string[]).includes(k))) as SettingsPatch;
    const next: SocietySettings = { ...current.data, ...patch, insurance: { ...current.data.insurance, ...patch.insurance } };
    const fieldErrors = { ...validateSocietySettings(next), ...(patch.fdSlabs ? validateFdSlabs(next.fdSlabs) : {}) };
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const touched = keysOf(patch);
    if (!touched.length) return this.bundle(user);
    // Saving a value confirms it: it is no longer a placeholder (docs/09).
    next.placeholders = current.data.placeholders.filter((p) => !touched.some((t) => t === p || t.startsWith(`${p}.`) || p.startsWith(`${t}.`)));
    const groups = touched.map((t) => t.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);
    const summary = `Changed ${groups.join(', ')}`;
    await withTransaction(this.app.db, async (tx) => {
      const row = await this.repo.addSettingsVersion(tx, { data: next, summary, createdBy: user.id });
      await this.app.audit.record(request, { action: 'update', entity: 'settings', entityId: 'society', summary: `${summary} (version ${row.version})`, before: current.data, after: next }, tx);
    });
    return this.bundle(user);
  }

  /** ST-64: a new version of one loan product. */
  async updateLoanProduct(request: FastifyRequest, code: LoanProductCode, body: Partial<LoanProduct>): Promise<SettingsBundle> {
    const user = sessionOf(request);
    const currentRow = (await this.repo.activeProduct(code)) ?? fail('NOT_FOUND', 'Unknown loan product.');
    const current = toLoanProduct(currentRow);
    const rest = Object.fromEntries(Object.entries(body).filter(([k]) => (PRODUCT_FIELDS as string[]).includes(k))) as Partial<LoanProduct>;
    const next: LoanProduct = { ...current, ...rest, code, placeholder: false };
    const fieldErrors = validateLoanProduct(next);
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    const changed = (Object.keys(rest) as Array<keyof LoanProduct>).filter((k) => rest[k] !== current[k]);
    const rateNote = rest.ratePercent !== undefined && rest.ratePercent !== current.ratePercent ? ` (rate ${current.ratePercent}% → ${rest.ratePercent}%)` : '';
    const summary = `${current.name}: ${changed.length ? changed.join(', ') : 'confirmed'}${rateNote}`;
    await withTransaction(this.app.db, async (tx) => {
      const row = await this.repo.addProductVersion(tx, { ...next, summary, createdBy: user.id });
      await this.app.audit.record(request, { action: 'update', entity: 'loanProduct', entityId: code, summary: `${summary} (version ${row.version})`, before: current, after: next }, tx);
    });
    return this.bundle(user);
  }

  // ---- version history (REQ-130) ----
  async settingsVersions() {
    return (await this.repo.settingsHistory()).map((r) => ({ id: r.id, version: r.version, status: r.status, summary: r.summary, createdBy: r.createdBy ?? undefined, createdAt: r.createdAt.toISOString(), data: r.data }));
  }

  async productVersions(code: LoanProductCode) {
    const rows = await this.repo.productHistory(code);
    if (!rows.length) fail('NOT_FOUND', 'Unknown loan product.');
    return rows.map((r) => ({ id: r.id, version: r.version, status: r.status, summary: r.summary, createdBy: r.createdBy ?? undefined, createdAt: r.createdAt.toISOString(), product: toLoanProduct(r) }));
  }

  // ---- ST-63 templates ----
  async templates(): Promise<NotificationTemplate[]> {
    return (await this.repo.templates()).map(toTemplate);
  }

  async updateTemplate(request: FastifyRequest, key: string, body: Partial<NotificationTemplate>): Promise<NotificationTemplate[]> {
    const current = (await this.repo.template(key)) ?? fail('NOT_FOUND', 'Unknown template.');
    const fieldErrors: Record<string, string> = {};
    const title = (body.title ?? current.title).trim();
    const text = (body.body ?? current.body).trim();
    const channels = body.channels ?? current.channels;
    if (!title) fieldErrors.title = 'Enter a title.';
    if (text.length < 10) fieldErrors.body = 'Write at least 10 characters.';
    if (!channels.length) fieldErrors.channels = 'Pick at least one channel.';
    // Only the placeholders the event fills in are allowed, e.g. {borrower}.
    const seed = NOTIFICATION_TEMPLATES.find((t) => t.key === key);
    const allowed = new Set([...`${seed?.title ?? current.title} ${seed?.body ?? current.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    const unknown = [...`${title} ${text}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !allowed.has(v));
    if (unknown.length) fieldErrors.body = `Unknown placeholder: {${unknown[0]}}. Use the ones listed.`;
    if (Object.keys(fieldErrors).length) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors });
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.updateTemplate(tx, key, { title, body: text, channels });
      await this.app.audit.record(request, { action: 'update', entity: 'template', entityId: key, summary: `Edited "${current.event}"`, before: toTemplate(current), after: { title, body: text, channels } }, tx);
    });
    return this.templates();
  }

  // ---- MB-16 rate card ----
  async rates(): Promise<RatesReference> {
    const [settings, products, [last]] = await Promise.all([this.settings(), this.loanProducts(), this.repo.recentChanges(['settings', 'loanProduct'], 1)]);
    return {
      loanProducts: products.map(({ code, name, ratePercent, minAmount, maxAmount, maxInstalments, emiMethod, suretiesRequired, shareDepositPercent, placeholder }) => ({
        code, name, ratePercent, minAmount, maxAmount, maxInstalments, emiMethod, suretiesRequired, shareDepositPercent, placeholder,
      })),
      fdSlabs: settings.fdSlabs,
      savingsRatePercent: settings.savingsRatePercent,
      crdRatePercent: settings.crdRatePercent,
      srdsRatePercent: settings.srdsRatePercent,
      ...(last ? { updatedAt: last.at.toISOString() } : {}),
    };
  }

  // ---- helpers ----
  private async activeSettingsRow(): Promise<SettingsRow> {
    return (await this.repo.activeSettings()) ?? fail('NOT_FOUND', 'Society settings are not set up. Run the seed or create version 1.');
  }

  async society(): Promise<SocietyProfile> {
    const s = (await this.repo.society()) ?? fail('NOT_FOUND', 'The society profile is not set up.');
    return { name: s.name, shortName: s.shortName, registrationNo: s.registrationNo, address: s.address };
  }

  private async recentChanges(): Promise<AuditEntry[]> {
    return (await this.repo.recentChanges(CHANGE_ENTITIES, 12)).map((a) => ({
      id: a.id,
      at: a.at.toISOString(),
      actorId: a.actorId ?? '',
      actorName: a.actorName ?? 'System',
      entity: a.entity,
      entityId: a.entityId ?? '',
      action: a.action,
      summary: a.summary,
    }));
  }
}
