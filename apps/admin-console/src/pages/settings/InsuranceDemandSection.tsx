// ST-66 Insurance & demand rules: the fixed monthly heads, insurance, defaulter rule and the
// (locked) recovery priority from the agreement.
import { Lock } from 'lucide-react';
import { SingleSelectV2 } from '@juspay/blend-design-system';
import { HEAD_PRIORITY } from '@tgs/domain';
import type { DemandHead, SettingsBundle, SocietySettings } from '@tgs/types';
import { FormSection, MoneyField, NumberField, PlaceholderTag, SaveBar, useEditable } from '@/components/Form';
import { api } from '@/lib/api';
import { MONTH_ITEMS, isPlaceholder, useSettingsSave } from './shared';

type Values = Pick<SocietySettings, 'insurance' | 'rrfMonthly' | 'crdMonthly' | 'srdsMonthly' | 'defaulterCycles'>;

const HEAD_LABEL: Record<DemandHead, string> = {
  RRF: 'RRF',
  INSURANCE: 'Insurance',
  CRD: 'CRD',
  SRDS: 'SRDS',
  SHARE_CAPITAL: 'Share capital (new members)',
  PENAL: 'Penal interest',
  INTEREST: 'Loan interest (Education → Salary → Ordinary → Deposit)',
  PRINCIPAL: 'Loan principal (same order)',
};

export function InsuranceDemandSection({ bundle }: { bundle: SettingsBundle }) {
  const ro = !bundle.canEdit;
  const s = bundle.settings;
  const form = useEditable<Values>({ insurance: s.insurance, rrfMonthly: s.rrfMonthly, crdMonthly: s.crdMonthly, srdsMonthly: s.srdsMonthly, defaulterCycles: s.defaulterCycles });
  const save = useSettingsSave(api.settings.updateValues, 'Demand rules saved');
  const v = form.draft!;
  const set = (patch: Partial<Values>) => form.setDraft({ ...v, ...patch });
  const errors = save.fieldErrors;
  const ph = (k: string) => (isPlaceholder(bundle, k) ? <PlaceholderTag /> : undefined);
  const order = (Object.keys(HEAD_PRIORITY) as DemandHead[]).sort((a, b) => HEAD_PRIORITY[a] - HEAD_PRIORITY[b]);

  return (
    <div className="flex flex-col gap-5">
      <FormSection title="Monthly heads" description="Added to every member's demand each cycle (BR-009). Changes apply from the next generated sheet." tag={ph('rrfMonthly') ?? ph('crdMonthly')} columns={3}>
        <MoneyField label="RRF per month" name="rrfMonthly" value={v.rrfMonthly} onChange={(rrfMonthly) => set({ rrfMonthly })} errors={errors} disabled={ro} />
        <MoneyField label="CRD per month" name="crdMonthly" value={v.crdMonthly} onChange={(crdMonthly) => set({ crdMonthly })} errors={errors} disabled={ro} />
        <MoneyField label="SRDS per month" name="srdsMonthly" value={v.srdsMonthly} onChange={(srdsMonthly) => set({ srdsMonthly })} errors={errors} disabled={ro} hint="Only members with an SRDS account" />
      </FormSection>

      <FormSection title="Insurance" description="BR-008: collected once a year in the collection month." tag={ph('insurance')} columns={3}>
        <MoneyField label="Members with a loan" name="insurance.loaneeAmount" value={v.insurance.loaneeAmount} onChange={(loaneeAmount) => set({ insurance: { ...v.insurance, loaneeAmount } })} errors={errors} disabled={ro} />
        <MoneyField label="Members without a loan" name="insurance.nonLoaneeAmount" value={v.insurance.nonLoaneeAmount} onChange={(nonLoaneeAmount) => set({ insurance: { ...v.insurance, nonLoaneeAmount } })} errors={errors} disabled={ro} />
        <SingleSelectV2 label="Collection month" placeholder="Month" items={[{ items: MONTH_ITEMS }]} selected={String(v.insurance.collectionMonth)} onSelect={(m) => set({ insurance: { ...v.insurance, collectionMonth: Number(m) } })} disabled={ro} />
      </FormSection>

      <FormSection title="Defaulters" description="BR-020: a member becomes a defaulter after this many short cycles in a row." tag={ph('defaulterCycles')}>
        <NumberField label="Short cycles in a row" name="defaulterCycles" value={v.defaulterCycles} onChange={(defaulterCycles) => set({ defaulterCycles })} errors={errors} unit="cycles" disabled={ro} />
      </FormSection>

      <section className="rounded-card border border-line bg-surface shadow-raised">
        <header className="flex items-start justify-between gap-2 border-b border-line-subtle px-5 py-4">
          <div>
            <h2 className="text-card-title text-fg">Recovery priority</h2>
            <p className="mt-0.5 text-caption text-fg-tertiary">BR-011, set by the agreement (§3.6). A short salary deduction is applied top to bottom.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-caption text-fg-tertiary">
            <Lock size={14} aria-hidden /> Locked
          </span>
        </header>
        <ol className="divide-y divide-line-subtle">
          {order.map((h, i) => (
            <li key={h} className="flex items-center gap-3 px-5 py-2.5">
              <span className="tabular flex size-6 items-center justify-center rounded-pill bg-surface-muted text-caption-strong text-fg-secondary">{i + 1}</span>
              <span className="text-body text-fg">{HEAD_LABEL[h]}</span>
            </li>
          ))}
        </ol>
      </section>

      <SaveBar dirty={form.dirty} saving={save.isPending} onSave={() => save.mutate(v)} onDiscard={form.reset} />
    </div>
  );
}
