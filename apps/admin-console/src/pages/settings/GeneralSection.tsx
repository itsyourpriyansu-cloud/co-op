// ST-60 General: society profile, shares on joining, service and year, risk guards.
import { SingleSelectV2, TextAreaV2 } from '@juspay/blend-design-system';
import type { SettingsBundle, SocietyProfile, SocietySettings } from '@tgs/types';
import { FormSection, MoneyField, NumberField, PlaceholderTag, SaveBar, TextField, useEditable } from '@/components/Form';
import { api } from '@/lib/api';
import { MONTH_ITEMS, isPlaceholder, useSettingsSave } from './shared';

type Values = Pick<SocietySettings, 'shareValue' | 'admissionFee' | 'minShares' | 'maxShares' | 'retirementAge' | 'financialYearStartMonth' | 'maxGuaranteesPerSurety' | 'emiToNetSalaryMaxPercent' | 'membershipTargetHours' | 'loanTargetDays' | 'holidays' | 'casteCategories'>;
const pick = (s: SocietySettings): Values => ({
  shareValue: s.shareValue,
  admissionFee: s.admissionFee,
  minShares: s.minShares,
  maxShares: s.maxShares,
  retirementAge: s.retirementAge,
  financialYearStartMonth: s.financialYearStartMonth,
  maxGuaranteesPerSurety: s.maxGuaranteesPerSurety,
  emiToNetSalaryMaxPercent: s.emiToNetSalaryMaxPercent,
  membershipTargetHours: s.membershipTargetHours,
  loanTargetDays: s.loanTargetDays,
  holidays: s.holidays,
  casteCategories: s.casteCategories,
});

export function GeneralSection({ bundle }: { bundle: SettingsBundle }) {
  const ro = !bundle.canEdit;
  const society = useEditable<SocietyProfile>(bundle.society);
  const values = useEditable<Values>(pick(bundle.settings));
  const saveSociety = useSettingsSave(api.settings.updateSociety, 'Society profile saved');
  const saveValues = useSettingsSave(api.settings.updateValues, 'Settings saved');
  const s = society.draft!;
  const v = values.draft!;
  const setS = (patch: Partial<SocietyProfile>) => society.setDraft({ ...s, ...patch });
  const setV = (patch: Partial<Values>) => values.setDraft({ ...v, ...patch });
  const errors = { ...saveSociety.fieldErrors, ...saveValues.fieldErrors };
  const ph = (key: string) => (isPlaceholder(bundle, key) ? <PlaceholderTag /> : undefined);

  const save = async () => {
    if (society.dirty) await saveSociety.mutateAsync(s).catch(() => undefined);
    if (values.dirty) await saveValues.mutateAsync(v).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-5">
      <FormSection title="Society" description="Printed on every receipt, letter and form (letterhead).">
        <TextField label="Registered name" name="name" value={s.name} onChange={(name) => setS({ name })} errors={errors} disabled={ro} />
        <TextField label="Short name" name="shortName" value={s.shortName} onChange={(shortName) => setS({ shortName })} errors={errors} disabled={ro} />
        <TextField label="Registration No." name="registrationNo" value={s.registrationNo} onChange={(registrationNo) => setS({ registrationNo })} errors={errors} disabled={ro} />
        <div className="sm:col-span-2">
          <TextAreaV2 label="Address" placeholder="Registered address" value={s.address} onChange={(e) => setS({ address: e.target.value })} rows={2} disabled={ro} error={errors.address ? { show: true, message: errors.address } : undefined} />
        </div>
      </FormSection>

      <FormSection title="Shares on joining" description="BR-032. Applies to new members from the next application." tag={ph('shareValue') ?? ph('minShares')} columns={3}>
        <MoneyField label="Value of one share" name="shareValue" value={v.shareValue} onChange={(shareValue) => setV({ shareValue })} errors={errors} disabled={ro} />
        <MoneyField label="Admission fee" name="admissionFee" value={v.admissionFee} onChange={(admissionFee) => setV({ admissionFee })} errors={errors} disabled={ro} hint="₹0 = no fee" />
        <div className="hidden xl:block" />
        <NumberField label="Minimum shares" name="minShares" value={v.minShares} onChange={(minShares) => setV({ minShares })} errors={errors} unit="shares" disabled={ro} />
        <NumberField label="Maximum shares" name="maxShares" value={v.maxShares} onChange={(maxShares) => setV({ maxShares })} errors={errors} unit="shares" disabled={ro} />
      </FormSection>

      <FormSection title="Service and year" tag={ph('retirementAge')}>
        <NumberField label="Retirement age" name="retirementAge" value={v.retirementAge} onChange={(retirementAge) => setV({ retirementAge })} errors={errors} unit="years" disabled={ro} hint="Used for left-over service (BR-001, BR-002)" />
        <SingleSelectV2 label="Financial year starts in" placeholder="Month" items={[{ items: MONTH_ITEMS }]} selected={String(v.financialYearStartMonth)} onSelect={(m) => setV({ financialYearStartMonth: Number(m) })} disabled={ro} />
      </FormSection>

      <FormSection title="Service targets" description="REQ-135: the society aims to decide a membership within 48 hours and a loan within 4–5 days, counting working days only (F-14): Sundays, second Saturdays and the holidays below do not count. A loan's clock starts when its last surety signs. Work past the target is flagged on the Work Queue and dashboards. 0 = no target.">
        <NumberField label="Membership" name="membershipTargetHours" value={v.membershipTargetHours} onChange={(membershipTargetHours) => setV({ membershipTargetHours })} errors={errors} unit="working hours from submission" disabled={ro} />
        <NumberField label="Loan" name="loanTargetDays" value={v.loanTargetDays} onChange={(loanTargetDays) => setV({ loanTargetDays })} errors={errors} unit="working days from the last surety's signature" disabled={ro} />
        <TextAreaV2 label="Holidays" placeholder="2026-10-02" value={v.holidays.join('\n')} onChange={(e) => setV({ holidays: e.target.value.split(/[\s,]+/).filter(Boolean) })} rows={4} disabled={ro} error={errors.holidays ? { show: true, message: errors.holidays } : undefined} />
      </FormSection>

      <FormSection title="Caste categories" description="F-07: asked on every membership application and member record, shown to all staff and to the member. One category per line.">
        <TextAreaV2 label="Categories" placeholder="OC" value={v.casteCategories.join('\n')} onChange={(e) => setV({ casteCategories: e.target.value.split('\n').map((c) => c.trim()).filter(Boolean) })} rows={5} disabled={ro} error={errors.casteCategories ? { show: true, message: errors.casteCategories } : undefined} />
      </FormSection>

      <FormSection title="Risk guards" description="Placeholders until the society confirms them (D-055)." tag={ph('maxGuaranteesPerSurety')}>
        <NumberField label="Loans one member may guarantee" name="maxGuaranteesPerSurety" value={v.maxGuaranteesPerSurety} onChange={(maxGuaranteesPerSurety) => setV({ maxGuaranteesPerSurety })} errors={errors} unit="open loans" disabled={ro} hint="BR-014" />
        <NumberField label="First EMI at most" name="emiToNetSalaryMaxPercent" value={v.emiToNetSalaryMaxPercent} onChange={(emiToNetSalaryMaxPercent) => setV({ emiToNetSalaryMaxPercent })} errors={errors} unit="% of net salary" disabled={ro} hint="Warning only, never blocks" />
      </FormSection>

      <SaveBar
        dirty={society.dirty || values.dirty}
        saving={saveSociety.isPending || saveValues.isPending}
        onSave={() => void save()}
        onDiscard={() => {
          society.reset();
          values.reset();
        }}
      />
    </div>
  );
}
