// ST-64 Loan products & rates + workflow config (D-030). Edits open a drawer with a live EMI
// preview from @tgs/domain, so the effect of a rate change is visible before saving.
// D-123: the Admin sets the repayment periods (the only tenures members and staff can pick) and can add loan products.
import { useEffect, useState } from 'react';
import { Check, Minus, Pencil, Plus } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2Type, Radio, RadioGroup, Switch, SwitchSize, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { calculateEmi, formatINR, toPaise } from '@tgs/domain';
import type { LoanProduct, NewLoanProduct, SettingsBundle } from '@tgs/types';
import { MoneyField, MonthOptionsField, NumberField, PlaceholderTag, TextField, fieldErrorsOf, withoutBlank } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

const PREVIEW_AMOUNT = toPaise(100000);

/** The period used for the sample instalment: the one offered nearest to 24 months. */
const previewMonths = (options: number[]): number => {
  const typed = options.filter(Number.isFinite);
  return typed.reduce((best, o) => (Math.abs(o - 24) < Math.abs(best - 24) ? o : best), typed[0] ?? 24);
};

/** What a new product starts as in the Add drawer. Every value can be changed before saving. */
const BLANK_PRODUCT: LoanProduct = {
  code: '',
  name: '',
  ratePercent: 10,
  minAmount: toPaise(10000),
  maxAmount: toPaise(100000),
  maxInstalments: 24,
  instalmentOptions: [12, 24],
  enabled: true,
  maxConcurrent: 1,
  depositMarginPercent: 0,
  penalRatePercent: 0,
  suretiesRequired: 2,
  ddoCertificationRequired: true,
  shareDepositPercent: 0,
  topupAllowed: false,
  emiMethod: 'EQUAL_PRINCIPAL',
  placeholder: false,
};

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-caption ${on ? 'text-fg' : 'text-fg-tertiary'}`}>
      {on ? <Check size={14} className="text-success-fg" aria-hidden /> : <Minus size={14} aria-hidden />} {label}
    </span>
  );
}

function ProductCard({ p, canEdit, onEdit }: { p: LoanProduct; canEdit: boolean; onEdit: () => void }) {
  const months = previewMonths(p.instalmentOptions);
  const preview = calculateEmi(PREVIEW_AMOUNT, p.ratePercent, months, p.emiMethod);
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface shadow-raised">
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-card-title text-fg">{p.name}</h3>
            {p.placeholder && <PlaceholderTag />}
            {!p.enabled && <TagV2 text="Not offered" size={TagV2Size.XS} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
          </div>
          <p className="mt-0.5 text-caption text-fg-tertiary">{p.emiMethod === 'EQUAL_PRINCIPAL' ? 'Equal principal, interest on balance' : 'Equal monthly instalment'}</p>
        </div>
        {canEdit && <ButtonV2 text="Edit" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={14} /> }} onClick={onEdit} />}
      </header>
      <div className="flex items-baseline gap-2 px-5 pt-3">
        <span className="tabular text-metric text-fg">{p.ratePercent}%</span>
        <span className="text-caption text-fg-tertiary">a year</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-caption">
        <div>
          <dt className="text-fg-tertiary">Amount</dt>
          <dd className="tabular text-fg">
            {formatINR(p.minAmount)} – {formatINR(p.maxAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Repayment periods</dt>
          <dd className="tabular text-fg">{p.instalmentOptions.join(', ')} months</dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Share deposit</dt>
          <dd className="tabular text-fg">{p.shareDepositPercent}%</dd>
        </div>
        <div>
          <dt className="text-fg-tertiary">Running loans allowed</dt>
          <dd className="tabular text-fg">{p.maxConcurrent}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-subtle px-5 py-3">
        <Flag on={p.suretiesRequired > 0} label={p.suretiesRequired ? `${p.suretiesRequired} sureties` : 'No sureties'} />
        <Flag on={p.ddoCertificationRequired} label="DDO certifies" />
        <Flag on={p.topupAllowed} label="Top-up" />
        {p.code === 'DEPOSIT' && <Flag on label={`Up to ${p.depositMarginPercent}% of FD`} />}
      </div>
      <p className="mt-auto rounded-b-card bg-surface-subtle px-5 py-2.5 text-caption text-fg-secondary">
        ₹1,00,000 over {months} months → first instalment <span className="tabular text-fg">{formatINR(preview.firstInstalment)}</span>, interest <span className="tabular text-fg">{formatINR(preview.totalInterest)}</span>
      </p>
    </section>
  );
}

function ProductDrawer({ product, mode, onClose }: { product: LoanProduct | null; mode: 'edit' | 'add'; onClose: () => void }) {
  const [p, setP] = useState<LoanProduct | null>(product);
  useEffect(() => setP(product), [product]);
  const adding = mode === 'add';
  // The server works the maximum out from the periods, so only the periods are sent (D-123).
  const save = useSettingsSave(
    (x: LoanProduct) => {
      const body = { ...x, instalmentOptions: withoutBlank(x.instalmentOptions) };
      return adding ? api.settings.createLoanProduct(body as NewLoanProduct) : api.settings.updateLoanProduct(x.code, body);
    },
    adding ? 'Loan product added' : 'Loan product saved',
  );
  const errors = fieldErrorsOf(save.error);
  if (!p) return null;
  const set = (patch: Partial<LoanProduct>) => setP({ ...p, ...patch });
  const months = previewMonths(p.instalmentOptions);
  const before = product && !adding ? calculateEmi(PREVIEW_AMOUNT, product.ratePercent, previewMonths(product.instalmentOptions), product.emiMethod) : undefined;
  const after = Number.isFinite(p.ratePercent) && p.ratePercent > 0 ? calculateEmi(PREVIEW_AMOUNT, p.ratePercent, months, p.emiMethod) : undefined;
  return (
    <SideDrawer
      open={Boolean(product)}
      onClose={onClose}
      title={adding ? 'Add loan product' : `Edit ${p.name}`}
      description={adding ? 'A new product works like an Ordinary loan: sureties, form F2, its own rate and limits. It is open for applications as soon as you save it.' : 'Applies to new applications and calculators. Running loans keep the rate they were sanctioned at.'}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} />
          <ButtonV2 text={adding ? 'Add product' : 'Save product'} loading={save.isPending} onClick={() => save.mutate(p, { onSuccess: onClose })} />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {after && (
          <div className="rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
            <p className="text-caption-strong text-brand-text">Preview · ₹1,00,000 over {months} months</p>
            <p className="tabular mt-1 text-body text-fg">
              {before ? (
                <>
                  First instalment {formatINR(before.firstInstalment)} → <strong>{formatINR(after.firstInstalment)}</strong> · Interest {formatINR(before.totalInterest)} → <strong>{formatINR(after.totalInterest)}</strong>
                </>
              ) : (
                <>
                  First instalment <strong>{formatINR(after.firstInstalment)}</strong> · Interest <strong>{formatINR(after.totalInterest)}</strong>
                </>
              )}
            </p>
          </div>
        )}
        {adding && <TextField label="Loan name" name="name" value={p.name} onChange={(name) => set({ name })} errors={errors} placeholder="e.g. Festival Advance" required />}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Interest rate" name="ratePercent" value={p.ratePercent} onChange={(ratePercent) => set({ ratePercent })} errors={errors} unit="% a year" decimals />
          <NumberField label="Running loans allowed" name="maxConcurrent" value={p.maxConcurrent} onChange={(maxConcurrent) => set({ maxConcurrent })} errors={errors} unit="at once" />
          <MoneyField label="Minimum amount" name="minAmount" value={p.minAmount} onChange={(minAmount) => set({ minAmount })} errors={errors} />
          <MoneyField label="Maximum amount" name="maxAmount" value={p.maxAmount} onChange={(maxAmount) => set({ maxAmount })} errors={errors} />
          <NumberField label="Penal interest" name="penalRatePercent" value={p.penalRatePercent} onChange={(penalRatePercent) => set({ penalRatePercent })} errors={errors} unit="% a year on unpaid instalments" decimals hint="0 until the society confirms (F-06)" />
          <NumberField label="Share deposit" name="shareDepositPercent" value={p.shareDepositPercent} onChange={(shareDepositPercent) => set({ shareDepositPercent })} errors={errors} unit="% of loan" decimals />
          {p.code === 'DEPOSIT' && <NumberField label="Loan limit" name="depositMarginPercent" value={p.depositMarginPercent} onChange={(depositMarginPercent) => set({ depositMarginPercent })} errors={errors} unit="% of the FD" />}
        </div>
        <MonthOptionsField
          label="Repayment periods"
          name="instalmentOptions"
          value={p.instalmentOptions}
          onChange={(instalmentOptions) => set({ instalmentOptions })}
          errors={errors}
          hint="Members and staff can choose only these. A member whose remaining service is shorter sees the longer ones switched off."
        />
        <section className="flex flex-col gap-3">
          <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Workflow (D-030)</h3>
          <NumberField label="Sureties required" name="suretiesRequired" value={p.suretiesRequired} onChange={(suretiesRequired) => set({ suretiesRequired })} errors={errors} unit="members" hint="0 skips the surety stage" />
          <Switch checked={p.ddoCertificationRequired} onChange={(ddoCertificationRequired) => set({ ddoCertificationRequired })} size={SwitchSize.MEDIUM} label="Department DDO certifies the application" />
          <Switch checked={p.topupAllowed} onChange={(topupAllowed) => set({ topupAllowed })} size={SwitchSize.MEDIUM} label="Members may ask for a top-up" />
          {!adding && <Switch checked={p.enabled} onChange={(enabled) => set({ enabled })} size={SwitchSize.MEDIUM} label="Open for new applications (running loans are not affected)" />}
          <RadioGroup name="emiMethod" label="Instalment method" value={p.emiMethod} onChange={(v) => set({ emiMethod: v as LoanProduct['emiMethod'] })}>
            <Radio value="EQUAL_PRINCIPAL" subtext="Principal fixed, interest on the balance (falls every month)">
              Equal principal
            </Radio>
            <Radio value="AMORTIZED" subtext="Same amount every month">
              Equal monthly instalment
            </Radio>
          </RadioGroup>
        </section>
      </div>
    </SideDrawer>
  );
}

export function LoanProductsSection({ bundle }: { bundle: SettingsBundle }) {
  const [editing, setEditing] = useState<LoanProduct | null>(null);
  const [adding, setAdding] = useState<LoanProduct | null>(null);
  return (
    <>
      {bundle.canEdit && (
        <div className="mb-4 flex justify-end">
          <ButtonV2 text="Add loan product" size={ButtonV2Size.SMALL} leftSlot={{ slot: <Plus size={14} /> }} onClick={() => setAdding(BLANK_PRODUCT)} />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {bundle.loanProducts.map((p) => (
          <ProductCard key={p.code} p={p} canEdit={bundle.canEdit} onEdit={() => setEditing(p)} />
        ))}
      </div>
      <ProductDrawer product={editing} mode="edit" onClose={() => setEditing(null)} />
      <ProductDrawer product={adding} mode="add" onClose={() => setAdding(null)} />
    </>
  );
}
