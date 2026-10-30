import { z } from 'zod';

// Same shapes as the mock API (docs/11), so the console and the app work unchanged.

const paise = z.number().int().nonnegative();
const percent = z.number().min(0).max(100);

export const fdSlabSchema = z.object({ fromMonths: z.number().int(), toMonths: z.number().int(), ratePercent: z.number() });

export const societySettingsSchema = z.object({
  shareValue: paise,
  insurance: z.object({ loaneeAmount: paise, nonLoaneeAmount: paise, collectionMonth: z.number().int() }),
  rrfMonthly: paise,
  crdMonthly: paise,
  srdsMonthly: paise,
  retirementAge: z.number().int(),
  defaulterCycles: z.number().int(),
  fdSlabs: z.array(fdSlabSchema),
  savingsRatePercent: z.number(),
  fdMinAmount: paise,
  crdRatePercent: z.number(),
  srdsRatePercent: z.number(),
  minShares: z.number().int(),
  maxShares: z.number().int(),
  admissionFee: paise,
  maxGuaranteesPerSurety: z.number().int(),
  emiToNetSalaryMaxPercent: z.number(),
  penalGraceDays: z.number().int(),
  financialYearStartMonth: z.number().int(),
  placeholders: z.array(z.string()),
});

export const loanProductCode = z.enum(['ORDINARY', 'EDUCATION', 'SALARY', 'DEPOSIT']);

export const loanProductSchema = z.object({
  code: loanProductCode,
  name: z.string(),
  ratePercent: z.number(),
  minAmount: paise,
  maxAmount: paise,
  maxInstalments: z.number().int(),
  maxConcurrent: z.number().int(),
  depositMarginPercent: z.number(),
  penalRatePercent: z.number(),
  suretiesRequired: z.number().int(),
  ddoCertificationRequired: z.boolean(),
  shareDepositPercent: z.number(),
  topupAllowed: z.boolean(),
  emiMethod: z.enum(['AMORTIZED', 'EQUAL_PRINCIPAL']),
  placeholder: z.boolean(),
});

export const societyProfileSchema = z.object({ name: z.string(), shortName: z.string(), registrationNo: z.string(), address: z.string() });

export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  entity: z.string(),
  entityId: z.string(),
  action: z.string(),
  summary: z.string(),
});

export const settingsBundleSchema = z.object({
  society: societyProfileSchema,
  settings: societySettingsSchema,
  loanProducts: z.array(loanProductSchema),
  recentChanges: z.array(auditEntrySchema),
  canEdit: z.boolean(),
});

// ---- inputs: partial, unknown keys dropped; business checks come from @tgs/domain ----
export const societyInput = societyProfileSchema.partial();
export const settingsInput = societySettingsSchema
  .omit({ placeholders: true, insurance: true })
  .partial()
  .extend({ insurance: societySettingsSchema.shape.insurance.partial().optional(), shareValue: paise.optional() })
  .extend({ emiToNetSalaryMaxPercent: percent.optional() });
export const loanProductInput = loanProductSchema.omit({ code: true, placeholder: true }).partial();
export const productParams = z.object({ code: loanProductCode });

// ---- templates ----
export const templateSchema = z.object({
  key: z.string(),
  event: z.string(),
  title: z.string(),
  body: z.string(),
  channels: z.array(z.enum(['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP'])),
  audience: z.enum(['MEMBER', 'APPLICANT', 'STAFF']),
});
export const templateInput = templateSchema.pick({ title: true, body: true, channels: true }).partial();
export const templateParams = z.object({ key: z.string().min(1) });

// ---- MB-16 ----
export const ratesSchema = z.object({
  loanProducts: z.array(
    loanProductSchema.pick({ code: true, name: true, ratePercent: true, minAmount: true, maxAmount: true, maxInstalments: true, emiMethod: true, suretiesRequired: true, shareDepositPercent: true, placeholder: true }),
  ),
  fdSlabs: z.array(fdSlabSchema),
  savingsRatePercent: z.number(),
  crdRatePercent: z.number(),
  srdsRatePercent: z.number(),
  updatedAt: z.string().optional(),
});

// ---- version history (REQ-130) ----
const versionBase = { id: z.string(), version: z.number().int(), status: z.enum(['ACTIVE', 'INACTIVE']), summary: z.string(), createdBy: z.string().optional(), createdAt: z.string() };
export const settingsVersionsSchema = z.array(z.object({ ...versionBase, data: societySettingsSchema }));
export const productVersionsSchema = z.array(z.object({ ...versionBase, product: loanProductSchema }));
