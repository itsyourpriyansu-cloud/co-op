// ST-64 Loan products & rates + workflow config (D-030). Edits open a drawer with a live EMI
// preview from @tgs/domain, so the effect of a rate change is visible before saving.
import { useEffect, useState } from 'react';
import { Check, Minus, Pencil } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2Type, Radio, RadioGroup, Switch, SwitchSize } from '@juspay/blend-design-system';
import { calculateEmi, formatINR, toPaise } from '@tgs/domain';
import type { LoanProduct, SettingsBundle } from '@tgs/types';
import { MoneyField, NumberField, PlaceholderTag, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

const PREVIEW_AMOUNT = toPaise(100000);

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-caption ${on ? 'text-fg' : 'text-fg-tertiary'}`}>
      {on ? <Check size={14} className="text-success-fg" aria-hidden /> : <Minus size={14} aria-hidden />} {label}
    </span>
  );
}

function ProductCard({ p, canEdit, onEdit }: { p: LoanProduct; canEdit: boolean; onEdit: () => void }) {
  const preview = calculateEmi(PREVIEW_AMOUNT, p.ratePercent, Math.min(24, p.maxInstalments), p.emiMethod);
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface shadow-raised">
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-card-title text-fg">{p.name}</h3>
            {p.placeholder && <PlaceholderTag />}
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
          <dt className="text-fg-tertiary">Instalments</dt>
          <dd className="tabular text-fg">up to {p.maxInstalments}</dd>
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
        ₹1,00,000 over {Math.min(24, p.maxInstalments)} months → first instalment <span className="tabular text-fg">{formatINR(preview.firstInstalment)}</span>, interest <span className="tabular text-fg">{formatINR(preview.totalInterest)}</span>
      </p>
    </section>
  );
}

function EditDrawer({ product, onClose }: { product: LoanProduct | null; onClose: () => void }) {
  const [p, setP] = useState<LoanProduct | null>(product);
  useEffect(() => setP(product), [product]);
  const save = useSettingsSave((x: LoanProduct) => api.settings.updateLoanProduct(x.code, x), 'Loan product saved');
  const errors = fieldErrorsOf(save.error);
  if (!p) return null;
  const set = (patch: Partial<LoanProduct>) => setP({ ...p, ...patch });
  const months = Math.min(24, Number.isFinite(p.maxInstalments) ? p.maxInstalments : 24);
  const before = product ? calculateEmi(PREVIEW_AMOUNT, product.ratePercent, months, product.emiMethod) : undefined;
  const after = Number.isFinite(p.ratePercent) && p.ratePercent > 0 ? calculateEmi(PREVIEW_AMOUNT, p.ratePercent, months, p.emiMethod) : undefined;
  return (
    <SideDrawer
      open={Boolean(product)}
      onClose={onClose}
      title={`Edit ${p.name}`}
      description="Applies to new applications and calculators. Running loans keep the rate they were sanctioned at."
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} />
          <ButtonV2 text="Save product" loading={save.isPending} onClick={() => save.mutate(p, { onSuccess: onClose })} />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {before && after && (
          <div className="rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
            <p className="text-caption-strong text-brand-text">Preview · ₹1,00,000 over {months} months</p>
            <p className="tabular mt-1 text-body text-fg">
              First instalment {formatINR(before.firstInstalment)} → <strong>{formatINR(after.firstInstalment)}</strong> · Interest {formatINR(before.totalInterest)} → <strong>{formatINR(after.totalInterest)}</strong>
            </p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Interest rate" name="ratePercent" value={p.ratePercent} onChange={(ratePercent) => set({ ratePercent })} errors={errors} unit="% a year" decimals />
          <NumberField label="Maximum instalments" name="maxInstalments" value={p.maxInstalments} onChange={(maxInstalments) => set({ maxInstalments })} errors={errors} unit="months" />
          <MoneyField label="Minimum amount" name="minAmount" value={p.minAmount} onChange={(minAmount) => set({ minAmount })} errors={errors} />
          <MoneyField label="Maximum amount" name="maxAmount" value={p.maxAmount} onChange={(maxAmount) => set({ maxAmount })} errors={errors} />
          <NumberField label="Share deposit" name="shareDepositPercent" value={p.shareDepositPercent} onChange={(shareDepositPercent) => set({ shareDepositPercent })} errors={errors} unit="% of loan" decimals />
          <NumberField label="Running loans allowed" name="maxConcurrent" value={p.maxConcurrent} onChange={(maxConcurrent) => set({ maxConcurrent })} errors={errors} unit="at once" />
          {p.code === 'DEPOSIT' && <NumberField label="Loan limit" name="depositMarginPercent" value={p.depositMarginPercent} onChange={(depositMarginPercent) => set({ depositMarginPercent })} errors={errors} unit="% of the FD" />}
        </div>
        <section className="flex flex-col gap-3">
          <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Workflow (D-030)</h3>
          <NumberField label="Sureties required" name="suretiesRequired" value={p.suretiesRequired} onChange={(suretiesRequired) => set({ suretiesRequired })} errors={errors} unit="members" hint="0 skips the surety stage" />
          <Switch checked={p.ddoCertificationRequired} onChange={(ddoCertificationRequired) => set({ ddoCertificationRequired })} size={SwitchSize.MEDIUM} label="Department DDO certifies the application" />
          <Switch checked={p.topupAllowed} onChange={(topupAllowed) => set({ topupAllowed })} size={SwitchSize.MEDIUM} label="Members may ask for a top-up" />
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
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2">
        {bundle.loanProducts.map((p) => (
          <ProductCard key={p.code} p={p} canEdit={bundle.canEdit} onEdit={() => setEditing(p)} />
        ))}
      </div>
      <EditDrawer product={editing} onClose={() => setEditing(null)} />
    </>
  );
}
