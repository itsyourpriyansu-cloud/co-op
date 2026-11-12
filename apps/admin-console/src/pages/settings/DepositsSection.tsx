// ST-65 Deposit schemes & rates: FD slabs (BR-017) with a maturity preview, plus CRD, SRDS and
// savings rates, and (P6b, D-086) the FD maturity job and premature withdrawal.
import { Plus, Trash2 } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SingleSelectV2 } from '@juspay/blend-design-system';
import { calculateFdMaturity, formatINR, toPaise } from '@tgs/domain';
import type { SettingsBundle, SocietySettings } from '@tgs/types';
import { FormSection, MoneyField, NumberField, PlaceholderTag, SaveBar, useEditable } from '@/components/Form';
import { api } from '@/lib/api';
import { isPlaceholder, useSettingsSave } from './shared';

type Values = Pick<
  SocietySettings,
  'fdSlabs' | 'fdMinAmount' | 'savingsRatePercent' | 'crdRatePercent' | 'srdsRatePercent' | 'fdMaturityJobEnabled' | 'fdMaturityRunHour' | 'fdPrematureWithdrawalEnabled' | 'fdPrematurePenaltyMethod' | 'fdPrematurePenaltyPercent' | 'shareDepositRatePercent' | 'depositInterestBasis'
>;
const BASIS = [{ items: [{ label: 'Balance at the year end', value: 'YEAR_END' }, { label: 'Average of the 12 month-end balances', value: 'AVERAGE_MONTH_END' }] }];
const ON_OFF = [{ items: [{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }] }];
const METHODS = [{ items: [{ label: 'Cut the interest rate by the penalty', value: 'RATE_CUT' }, { label: 'Take a share of the interest earned', value: 'SHARE_OF_INTEREST' }] }];
const PRINCIPAL = toPaise(100000);

export function DepositsSection({ bundle }: { bundle: SettingsBundle }) {
  const ro = !bundle.canEdit;
  const s = bundle.settings;
  const form = useEditable<Values>({
    fdSlabs: s.fdSlabs,
    fdMinAmount: s.fdMinAmount,
    savingsRatePercent: s.savingsRatePercent,
    crdRatePercent: s.crdRatePercent,
    srdsRatePercent: s.srdsRatePercent,
    fdMaturityJobEnabled: s.fdMaturityJobEnabled,
    fdMaturityRunHour: s.fdMaturityRunHour,
    fdPrematureWithdrawalEnabled: s.fdPrematureWithdrawalEnabled,
    fdPrematurePenaltyMethod: s.fdPrematurePenaltyMethod,
    fdPrematurePenaltyPercent: s.fdPrematurePenaltyPercent,
    shareDepositRatePercent: s.shareDepositRatePercent,
    depositInterestBasis: s.depositInterestBasis,
  });
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
        <NumberField label="Share deposit" name="shareDepositRatePercent" value={v.shareDepositRatePercent} onChange={(shareDepositRatePercent) => set({ shareDepositRatePercent })} errors={errors} unit="% a year" decimals disabled={ro} />
        <SingleSelectV2 label="Interest worked on" placeholder="Choose" items={BASIS} selected={v.depositInterestBasis} onSelect={(x) => set({ depositInterestBasis: x as Values['depositInterestBasis'] })} disabled={ro} />
      </FormSection>

      <FormSection title="FD maturity" description="Each day after this hour (India time) the society marks fixed deposits that have reached their maturity date as matured and books their interest. Running it again changes nothing." columns={3}>
        <SingleSelectV2 label="Daily maturity processing" placeholder="Choose" items={ON_OFF} selected={v.fdMaturityJobEnabled ? 'on' : 'off'} onSelect={(x) => set({ fdMaturityJobEnabled: x === 'on' })} disabled={ro} />
        <NumberField label="Run after" name="fdMaturityRunHour" value={v.fdMaturityRunHour} onChange={(fdMaturityRunHour) => set({ fdMaturityRunHour })} errors={errors} unit="o'clock" hint="0 to 23" disabled={ro} />
      </FormSection>

      <FormSection
        title="Premature withdrawal"
        description={`The penalty comes only out of the interest: the member always gets the full principal back. ${v.fdPrematurePenaltyMethod === 'RATE_CUT' ? 'Interest is paid at the FD rate less this many percentage points.' : 'This percent of the interest earned is kept as the penalty.'} 0 means no penalty (F-06: the society has not confirmed the rate yet).`}
        tag={isPlaceholder(bundle, 'fdPrematurePenaltyPercent') || isPlaceholder(bundle, 'fdPrematurePenaltyMethod') ? <PlaceholderTag /> : undefined}
        columns={3}
      >
        <SingleSelectV2 label="Premature withdrawal" placeholder="Choose" items={ON_OFF} selected={v.fdPrematureWithdrawalEnabled ? 'on' : 'off'} onSelect={(x) => set({ fdPrematureWithdrawalEnabled: x === 'on' })} disabled={ro} />
        <SingleSelectV2 label="How the penalty is worked out" placeholder="Choose" items={METHODS} selected={v.fdPrematurePenaltyMethod} onSelect={(x) => set({ fdPrematurePenaltyMethod: x as Values['fdPrematurePenaltyMethod'] })} disabled={ro} />
        <NumberField label="Penalty" name="fdPrematurePenaltyPercent" value={v.fdPrematurePenaltyPercent} onChange={(fdPrematurePenaltyPercent) => set({ fdPrematurePenaltyPercent })} errors={errors} unit={v.fdPrematurePenaltyMethod === 'RATE_CUT' ? 'points' : '% of interest'} decimals disabled={ro} />
      </FormSection>

      <SaveBar dirty={form.dirty} saving={save.isPending} onSave={() => save.mutate(v)} onDiscard={form.reset} />
    </div>
  );
}
