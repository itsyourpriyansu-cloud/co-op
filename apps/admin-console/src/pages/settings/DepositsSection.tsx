// ST-65 Deposit schemes & rates: FD slabs (BR-017) with a maturity preview, plus CRD, SRDS and
// savings rates.
import { Plus, Trash2 } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { calculateFdMaturity, formatINR, toPaise } from '@tgs/domain';
import type { SettingsBundle, SocietySettings } from '@tgs/types';
import { FormSection, MoneyField, NumberField, PlaceholderTag, SaveBar, useEditable } from '@/components/Form';
import { api } from '@/lib/api';
import { isPlaceholder, useSettingsSave } from './shared';

type Values = Pick<SocietySettings, 'fdSlabs' | 'fdMinAmount' | 'savingsRatePercent' | 'crdRatePercent' | 'srdsRatePercent'>;
const PRINCIPAL = toPaise(100000);

export function DepositsSection({ bundle }: { bundle: SettingsBundle }) {
  const ro = !bundle.canEdit;
  const s = bundle.settings;
  const form = useEditable<Values>({ fdSlabs: s.fdSlabs, fdMinAmount: s.fdMinAmount, savingsRatePercent: s.savingsRatePercent, crdRatePercent: s.crdRatePercent, srdsRatePercent: s.srdsRatePercent });
  const save = useSettingsSave(api.settings.updateValues, 'Deposit rates saved');
  const v = form.draft!;
  const set = (patch: Partial<Values>) => form.setDraft({ ...v, ...patch });
  const setSlab = (i: number, patch: Partial<Values['fdSlabs'][number]>) => set({ fdSlabs: v.fdSlabs.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const errors = save.fieldErrors;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-line bg-surface shadow-raised">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle px-5 py-4">
          <div>
            <h2 className="text-card-title text-fg">Fixed deposit rates</h2>
            <p className="mt-0.5 text-caption text-fg-tertiary">One rate per tenure band. Bands must not overlap. Preview: ₹1,00,000 paid on maturity (quarterly compounding, Q-313).</p>
          </div>
          {isPlaceholder(bundle, 'fdSlabs') && <PlaceholderTag />}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="text-overline uppercase tracking-wide text-fg-tertiary">
                <th className="px-5 py-2 font-semibold">From</th>
                <th className="px-2 py-2 font-semibold">To</th>
                <th className="px-2 py-2 font-semibold">Rate</th>
                <th className="px-2 py-2 text-right font-semibold">₹1,00,000 grows to</th>
                <th className="w-12 px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {v.fdSlabs.map((slab, i) => {
                const m = Number.isFinite(slab.ratePercent) && slab.ratePercent > 0 && Number.isFinite(slab.fromMonths) ? calculateFdMaturity({ principal: PRINCIPAL, ratePercent: slab.ratePercent, tenureMonths: slab.fromMonths, payout: 'ON_MATURITY', openedOn: '2026-01-01' }) : undefined;
                return (
                  <tr key={i} className="align-top">
                    <td className="w-40 px-5 py-3">
                      <NumberField label="" name={`fdSlabs.${i}.fromMonths`} value={slab.fromMonths} onChange={(fromMonths) => setSlab(i, { fromMonths })} errors={errors} unit="months" disabled={ro} />
                    </td>
                    <td className="w-40 px-2 py-3">
                      <NumberField label="" name={`fdSlabs.${i}.toMonths`} value={slab.toMonths} onChange={(toMonths) => setSlab(i, { toMonths })} errors={errors} unit="months" disabled={ro} />
                    </td>
                    <td className="w-36 px-2 py-3">
                      <NumberField label="" name={`fdSlabs.${i}.ratePercent`} value={slab.ratePercent} onChange={(ratePercent) => setSlab(i, { ratePercent })} errors={errors} unit="%" decimals disabled={ro} />
                    </td>
                    <td className="tabular px-2 py-5 text-right text-body text-fg">{m ? `${formatINR(m.maturityValue)} in ${slab.fromMonths} m` : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {!ro && v.fdSlabs.length > 1 && (
                        <ButtonV2 subType={ButtonV2SubType.ICON_ONLY} buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Trash2 size={14} /> }} aria-label={`Remove band ${i + 1}`} onClick={() => set({ fdSlabs: v.fdSlabs.filter((_, j) => j !== i) })} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.fdSlabs && <p className="px-5 pb-3 text-caption text-danger-fg">{errors.fdSlabs}</p>}
        {!ro && (
          <div className="border-t border-line-subtle px-5 py-3">
            <ButtonV2
              text="Add band"
              buttonType={ButtonV2Type.SECONDARY}
              size={ButtonV2Size.SMALL}
              leftSlot={{ slot: <Plus size={14} /> }}
              onClick={() => {
                const last = v.fdSlabs.at(-1);
                const from = (last?.toMonths ?? 0) + 1;
                set({ fdSlabs: [...v.fdSlabs, { fromMonths: from, toMonths: from + 11, ratePercent: last?.ratePercent ?? 7 }] });
              }}
            />
          </div>
        )}
      </section>

      <FormSection title="Fixed deposit minimum" description="The smallest FD the society accepts (Q-313)." tag={isPlaceholder(bundle, 'fdMinAmount') ? <PlaceholderTag /> : undefined} columns={3}>
        <MoneyField label="Minimum amount" name="fdMinAmount" value={v.fdMinAmount} onChange={(fdMinAmount) => set({ fdMinAmount })} errors={errors} disabled={ro} />
      </FormSection>

      <FormSection title="Other deposits" description="Annual rates credited to members' compulsory and savings deposits." tag={isPlaceholder(bundle, 'crdRatePercent') ? <PlaceholderTag /> : undefined} columns={3}>
        <NumberField label="CRD" name="crdRatePercent" value={v.crdRatePercent} onChange={(crdRatePercent) => set({ crdRatePercent })} errors={errors} unit="% a year" decimals disabled={ro} />
        <NumberField label="SRDS" name="srdsRatePercent" value={v.srdsRatePercent} onChange={(srdsRatePercent) => set({ srdsRatePercent })} errors={errors} unit="% a year" decimals disabled={ro} />
        <NumberField label="Savings" name="savingsRatePercent" value={v.savingsRatePercent} onChange={(savingsRatePercent) => set({ savingsRatePercent })} errors={errors} unit="% a year" decimals disabled={ro} />
      </FormSection>

      <SaveBar dirty={form.dirty} saving={save.isPending} onSave={() => save.mutate(v)} onDiscard={form.reset} />
    </div>
  );
}
