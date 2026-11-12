// ST-60m … ST-68m one settings section. The server validates and versions every save; this only edits.
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Minus, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { calculateEmi, calculateFdMaturity, formatDisplayDateTime, formatINR, HEAD_PRIORITY, toPaise } from '@tgs/domain';
import { CONSOLE_ROLES, ROLE_LABELS, type ConsoleRole, type DemandHead, type Department, type LoanProduct, type NotificationTemplate, type SettingsBundle, type SocietyProfile, type SocietySettings, type StaffUser } from '@tgs/types';
import { ActionAlert, ask, Loaded, MoneyField, RecordCard, Stack2, useAction, plain } from '@/components/staff';
import { api } from '@/lib/api';
import { AUDIENCE, CHANNELS, ENTITY, fill, isPlaceholder, MONTHS, RECOVERY_LABEL, ROLE_HINT, SECTIONS, vars } from '@/lib/staffSettings';
import { Alert, Button, Card, Checkbox, EmptyState, Header, KeyValue, Screen, Section, Segmented, SelectField, Tag, Text, TextField } from '@/ui';
import { color, space } from '@/theme';

const LAKH = toPaise(100000);

// ---- Fields --------------------------------------------------------------------------------

/** Keeps its own text so "7." survives while typing a decimal. */
function Num({ label, value, onChange, unit, hint, error, decimals, disabled }: { label: string; value: number; onChange: (n: number) => void; unit?: string; hint?: string; error?: string | undefined; decimals?: boolean; disabled?: boolean }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    setText((t) => (t !== '' && Number(t) === value ? t : Number.isFinite(value) ? String(value) : ''));
  }, [value]);
  return (
    <TextField
      label={label}
      value={text}
      editable={!disabled}
      keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
      {...(unit ? { suffix: <Text role="caption" tone="tertiary">{unit}</Text> } : {})}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      onChangeText={(raw) => {
        const t = raw.replace(decimals ? /[^0-9.]/g : /\D/g, '');
        setText(t);
        onChange(t === '' ? Number.NaN : Number(t));
      }}
    />
  );
}

/** One value per line. Keeps its own text so a new line isn't removed as soon as it's typed. */
function Lines({ label, value, onChange, split, placeholder, error, disabled }: { label: string; value: string[]; onChange: (v: string[]) => void; split: RegExp; placeholder: string; error?: string | undefined; disabled?: boolean }) {
  const parse = (t: string) => t.split(split).map((x) => x.trim()).filter(Boolean);
  const joined = value.join('\n');
  const [text, setText] = useState(joined);
  useEffect(() => {
    setText((t) => (parse(t).join('\n') === joined ? t : joined));
  }, [joined]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextField
      label={label}
      value={text}
      multiline
      numberOfLines={4}
      placeholder={placeholder}
      editable={!disabled}
      {...(error ? { error } : {})}
      onChangeText={(t) => {
        setText(t);
        onChange(parse(t));
      }}
    />
  );
}

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  if (disabled) return <KeyValue label={label} value={checked ? 'On' : 'Off'} />;
  return <Checkbox checked={checked} onChange={onChange} label={label} {...(description ? { description } : {})} />;
}

function Choose({ label, value, options, onChange, disabled }: { label: string; value: string; options: Array<{ value: string; label: string; hint?: string }>; onChange: (v: string) => void; disabled?: boolean }) {
  if (disabled) return <KeyValue label={label} value={options.find((o) => o.value === value)?.label ?? value} />;
  return <SelectField label={label} value={value} options={options} onChange={onChange} />;
}

const Placeholder = () => <Tag text="Placeholder" color="warning" size="xs" />;

function Block({ title, description, tag, children }: { title: string; description?: string; tag?: boolean; children: ReactNode }) {
  return (
    <Section title={title} {...(description ? { description } : {})} {...(tag ? { right: <Placeholder /> } : {})}>
      <View style={{ gap: space[8] }}>{children}</View>
    </Section>
  );
}

// ---- Editing -------------------------------------------------------------------------------

function useDraft<T>(initial: T) {
  const key = JSON.stringify(initial);
  const [draft, setDraft] = useState(initial);
  // A save refreshes the bundle: the draft follows the server's copy.
  useEffect(() => setDraft(initial), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { draft, setDraft, dirty: JSON.stringify(draft) !== key, reset: () => setDraft(initial) };
}

/** Header, view-only note and the docked Save / Discard shared by every form section. */
function Editor({ title, onBack, canEdit, dirty, a, onSave, onDiscard, saveText = 'Save changes', children }: { title: string; onBack: () => void; canEdit: boolean; dirty: boolean; a: ReturnType<typeof useAction>; onSave: () => Promise<boolean>; onDiscard: () => void; saveText?: string; children: ReactNode }) {
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaved(await onSave());
  };
  return (
    <Screen
      header={<Header title={title} onBack={onBack} />}
      {...(canEdit && dirty
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                <Button text={saveText} size="lg" fullWidth loading={a.busy} disabled={a.busy || a.unconfirmed} onPress={() => void save()} />
                <Button text="Discard" buttonType="secondary" fullWidth disabled={a.busy} onPress={onDiscard} />
              </View>
            ),
          }
        : {})}
    >
      {!canEdit ? <Alert type="neutral" heading="View only" description="Only the Super Admin can change settings." /> : null}
      {saved && !dirty ? <Alert type="success" heading="Saved" description="Recorded in the change history." /> : null}
      {children}
      <ActionAlert action={a} heading="Couldn't save" />
    </Screen>
  );
}

const back = () => router.back();

// ---- ST-60m General ------------------------------------------------------------------------

type GeneralValues = Pick<SocietySettings, 'shareValue' | 'admissionFee' | 'minShares' | 'maxShares' | 'retirementAge' | 'financialYearStartMonth' | 'maxGuaranteesPerSurety' | 'emiToNetSalaryMaxPercent' | 'membershipTargetHours' | 'loanTargetDays' | 'holidays' | 'casteCategories' | 'minAppVersion' | 'applicantDataRetentionMonths'>;

function General({ b, title }: { b: SettingsBundle; title: string }) {
  const ro = !b.canEdit;
  const x = b.settings;
  const society = useDraft<SocietyProfile>(b.society);
  const values = useDraft<GeneralValues>({ shareValue: x.shareValue, admissionFee: x.admissionFee, minShares: x.minShares, maxShares: x.maxShares, retirementAge: x.retirementAge, financialYearStartMonth: x.financialYearStartMonth, maxGuaranteesPerSurety: x.maxGuaranteesPerSurety, emiToNetSalaryMaxPercent: x.emiToNetSalaryMaxPercent, membershipTargetHours: x.membershipTargetHours, loanTargetDays: x.loanTargetDays, holidays: x.holidays, casteCategories: x.casteCategories, minAppVersion: x.minAppVersion, applicantDataRetentionMonths: x.applicantDataRetentionMonths });
  const a = useAction();
  const s = society.draft;
  const v = values.draft;
  const setS = (p: Partial<SocietyProfile>) => society.setDraft({ ...s, ...p });
  const setV = (p: Partial<GeneralValues>) => values.setDraft({ ...v, ...p });
  const e = a.fields;
  const ph = (k: string) => isPlaceholder(b, k);
  const save = () =>
    a.run(async () => {
      if (society.dirty) await api.settings.updateSociety(s);
      if (values.dirty) await api.settings.updateValues(v);
    });

  return (
    <Editor
      title={title}
      onBack={back}
      canEdit={b.canEdit}
      dirty={society.dirty || values.dirty}
      a={a}
      onSave={save}
      onDiscard={() => {
        society.reset();
        values.reset();
      }}
    >
      <Block title="Society" description="Printed on every receipt, letter and form (letterhead).">
        <TextField label="Registered name" value={s.name} onChangeText={(name) => setS({ name })} multiline numberOfLines={2} error={e.name} editable={!ro} />
        <TextField label="Short name" value={s.shortName} onChangeText={(shortName) => setS({ shortName })} error={e.shortName} editable={!ro} />
        <TextField label="Registration No." value={s.registrationNo} onChangeText={(registrationNo) => setS({ registrationNo })} error={e.registrationNo} editable={!ro} />
        <TextField label="Address" value={s.address} onChangeText={(address) => setS({ address })} multiline numberOfLines={4} error={e.address} editable={!ro} />
      </Block>
      <Block title="Shares on joining" description="Applies to new members from the next application." tag={ph('shareValue') || ph('minShares')}>
        <MoneyField label="Value of one share" value={v.shareValue} onChange={(shareValue) => setV({ shareValue })} error={e.shareValue} disabled={ro} />
        <MoneyField label="Admission fee" value={v.admissionFee} onChange={(admissionFee) => setV({ admissionFee })} error={e.admissionFee} disabled={ro} hint="₹0 = no fee" />
        <Num label="Minimum shares" value={v.minShares} onChange={(minShares) => setV({ minShares })} error={e.minShares} unit="shares" disabled={ro} />
        <Num label="Maximum shares" value={v.maxShares} onChange={(maxShares) => setV({ maxShares })} error={e.maxShares} unit="shares" disabled={ro} />
      </Block>
      <Block title="Service and year" tag={ph('retirementAge')}>
        <Num label="Retirement age" value={v.retirementAge} onChange={(retirementAge) => setV({ retirementAge })} error={e.retirementAge} unit="years" disabled={ro} hint="Used for left-over service" />
        <Choose label="Financial year starts in" value={String(v.financialYearStartMonth)} options={MONTHS} onChange={(m) => setV({ financialYearStartMonth: Number(m) })} disabled={ro} />
      </Block>
      <Block title="Service targets" description="Working days only. Sundays, second Saturdays and the holidays below do not count. A loan's clock starts when its last surety signs. 0 = no target.">
        <Num label="Membership" value={v.membershipTargetHours} onChange={(membershipTargetHours) => setV({ membershipTargetHours })} error={e.membershipTargetHours} unit="working hours" hint="From submission" disabled={ro} />
        <Num label="Loan" value={v.loanTargetDays} onChange={(loanTargetDays) => setV({ loanTargetDays })} error={e.loanTargetDays} unit="working days" hint="From the last surety's signature" disabled={ro} />
        <Lines label="Holidays" placeholder="2026-10-02" split={/[\s,]+/} value={v.holidays} onChange={(holidays) => setV({ holidays })} error={e.holidays} disabled={ro} />
      </Block>
      <Block title="Caste categories" description="Asked on every membership application and member record. One category per line.">
        <Lines label="Categories" placeholder="OC" split={/\n/} value={v.casteCategories} onChange={(casteCategories) => setV({ casteCategories })} error={e.casteCategories} disabled={ro} />
      </Block>
      <Block title="Risk guards" description="Placeholders until the society confirms them." tag={ph('maxGuaranteesPerSurety')}>
        <Num label="Loans one member may guarantee" value={v.maxGuaranteesPerSurety} onChange={(maxGuaranteesPerSurety) => setV({ maxGuaranteesPerSurety })} error={e.maxGuaranteesPerSurety} unit="open loans" disabled={ro} />
        <Num label="First EMI at most" value={v.emiToNetSalaryMaxPercent} onChange={(emiToNetSalaryMaxPercent) => setV({ emiToNetSalaryMaxPercent })} error={e.emiToNetSalaryMaxPercent} unit="% of net salary" hint="Warning only, never blocks" disabled={ro} />
      </Block>
      <Block title="Mobile app" description="Raise this when an old version must stop working. People on an older version see an update screen. 0.0.0 lets every version in.">
        <TextField label="Oldest version allowed" value={v.minAppVersion} onChangeText={(minAppVersion) => setV({ minAppVersion: minAppVersion.trim() })} error={e.minAppVersion} placeholder="1.0.0" editable={!ro} />
      </Block>
      <Block title="Personal data" description="DPDP: a rejected or withdrawn application, its documents and the applicant's sign-in are deleted this long after the last change." tag={ph('applicantDataRetentionMonths')}>
        <Num label="Delete closed applications after" value={v.applicantDataRetentionMonths} onChange={(applicantDataRetentionMonths) => setV({ applicantDataRetentionMonths })} error={e.applicantDataRetentionMonths} unit="months" disabled={ro} />
      </Block>
    </Editor>
  );
}

// ---- ST-64m Loan products ------------------------------------------------------------------

function ProductEdit({ product, onClose }: { product: LoanProduct; onClose: () => void }) {
  const [p, setP] = useState(product);
  const a = useAction();
  const e = a.fields;
  const set = (patch: Partial<LoanProduct>) => setP({ ...p, ...patch });
  const months = Math.min(24, Number.isFinite(p.maxInstalments) ? p.maxInstalments : 24);
  const before = calculateEmi(LAKH, product.ratePercent, months, product.emiMethod);
  const after = Number.isFinite(p.ratePercent) && p.ratePercent > 0 && months > 0 ? calculateEmi(LAKH, p.ratePercent, months, p.emiMethod) : undefined;
  const save = async () => {
    const ok = await a.run(() => api.settings.updateLoanProduct(p.code, p));
    if (ok) onClose();
    return ok;
  };
  return (
    <Editor title={`Edit ${p.name}`} onBack={onClose} canEdit dirty={JSON.stringify(p) !== JSON.stringify(product)} a={a} onSave={save} onDiscard={() => setP(product)} saveText="Save product">
      <Text role="body" tone="secondary">
        Applies to new applications and calculators. Running loans keep the rate they were sanctioned at.
      </Text>
      {after ? (
        <Alert type="primary" heading={`Preview · ₹1,00,000 over ${months} months`} description={`First instalment ${formatINR(before.firstInstalment)} → ${formatINR(after.firstInstalment)} · Interest ${formatINR(before.totalInterest)} → ${formatINR(after.totalInterest)}`} />
      ) : null}
      <Num label="Interest rate" value={p.ratePercent} onChange={(ratePercent) => set({ ratePercent })} error={e.ratePercent} unit="% a year" decimals />
      <Num label="Maximum instalments" value={p.maxInstalments} onChange={(maxInstalments) => set({ maxInstalments })} error={e.maxInstalments} unit="months" />
      <MoneyField label="Minimum amount" value={p.minAmount} onChange={(minAmount) => set({ minAmount })} error={e.minAmount} />
      <MoneyField label="Maximum amount" value={p.maxAmount} onChange={(maxAmount) => set({ maxAmount })} error={e.maxAmount} />
      <Num label="Penal interest" value={p.penalRatePercent} onChange={(penalRatePercent) => set({ penalRatePercent })} error={e.penalRatePercent} unit="% a year" hint="On unpaid instalments. 0 until the society confirms" decimals />
      <Num label="Share deposit" value={p.shareDepositPercent} onChange={(shareDepositPercent) => set({ shareDepositPercent })} error={e.shareDepositPercent} unit="% of loan" decimals />
      <Num label="Running loans allowed" value={p.maxConcurrent} onChange={(maxConcurrent) => set({ maxConcurrent })} error={e.maxConcurrent} unit="at once" />
      {p.code === 'DEPOSIT' ? <Num label="Loan limit" value={p.depositMarginPercent ?? Number.NaN} onChange={(depositMarginPercent) => set({ depositMarginPercent })} error={e.depositMarginPercent} unit="% of the FD" /> : null}
      <Block title="Workflow">
        <Num label="Sureties required" value={p.suretiesRequired} onChange={(suretiesRequired) => set({ suretiesRequired })} error={e.suretiesRequired} unit="members" hint="0 skips the surety stage" />
        <Checkbox checked={p.ddoCertificationRequired} onChange={(ddoCertificationRequired) => set({ ddoCertificationRequired })} label="Department DDO certifies the application" />
        <Checkbox checked={p.topupAllowed} onChange={(topupAllowed) => set({ topupAllowed })} label="Members may ask for a top-up" />
        <Segmented label="Instalment method" value={p.emiMethod} options={[{ value: 'EQUAL_PRINCIPAL', label: 'Equal principal' }, { value: 'AMORTIZED', label: 'Equal EMI' }]} onChange={(v) => set({ emiMethod: v as LoanProduct['emiMethod'] })} />
        <Text role="caption" tone="tertiary">
          {p.emiMethod === 'EQUAL_PRINCIPAL' ? 'Principal fixed, interest on the balance (falls every month).' : 'Same amount every month.'}
        </Text>
      </Block>
    </Editor>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  const Icon = on ? Check : Minus;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon size={14} color={on ? color.status.success.fg : color.text.tertiary} />
      <Text role="caption" tone={on ? 'primary' : 'tertiary'}>
        {label}
      </Text>
    </View>
  );
}

function LoanProducts({ b, title }: { b: SettingsBundle; title: string }) {
  const [editing, setEditing] = useState<LoanProduct>();
  if (editing) return <ProductEdit product={editing} onClose={() => setEditing(undefined)} />;
  return (
    <Screen header={<Header title={title} onBack={back} />}>
      {b.loanProducts.map((p) => {
        const preview = calculateEmi(LAKH, p.ratePercent, Math.min(24, p.maxInstalments), p.emiMethod);
        return (
          <Card key={p.code}>
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Text role="cardTitle" style={{ flex: 1 }}>
                  {p.name} · {p.ratePercent}%
                </Text>
                {p.placeholder ? <Placeholder /> : null}
                {b.canEdit ? <Button text="Edit" size="sm" buttonType="secondary" leftSlot={Pencil} accessibilityLabel={`Edit ${p.name}`} onPress={() => setEditing(p)} /> : null}
              </View>
              <Text role="caption" tone="tertiary">
                {p.emiMethod === 'EQUAL_PRINCIPAL' ? 'Equal principal, interest on balance' : 'Equal monthly instalment'}
              </Text>
              <KeyValue label="Amount" value={`${formatINR(p.minAmount)} – ${formatINR(p.maxAmount)}`} />
              <KeyValue label="Instalments" value={`up to ${p.maxInstalments}`} />
              <KeyValue label="Share deposit" value={`${p.shareDepositPercent}%`} />
              <KeyValue label="Running loans allowed" value={String(p.maxConcurrent)} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
                <Flag on={p.suretiesRequired > 0} label={p.suretiesRequired ? `${p.suretiesRequired} sureties` : 'No sureties'} />
                <Flag on={p.ddoCertificationRequired} label="DDO certifies" />
                <Flag on={p.topupAllowed} label="Top-up" />
                {p.code === 'DEPOSIT' ? <Flag on label={`Up to ${p.depositMarginPercent}% of FD`} /> : null}
              </View>
              <Text role="caption" tone="secondary">
                ₹1,00,000 over {Math.min(24, p.maxInstalments)} months → first instalment {formatINR(preview.firstInstalment)}, interest {formatINR(preview.totalInterest)}
              </Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

// ---- ST-65m Deposit schemes ----------------------------------------------------------------

type DepositValues = Pick<SocietySettings, 'fdSlabs' | 'fdMinAmount' | 'savingsRatePercent' | 'crdRatePercent' | 'srdsRatePercent' | 'fdMaturityJobEnabled' | 'fdMaturityRunHour' | 'fdPrematureWithdrawalEnabled' | 'fdPrematurePenaltyMethod' | 'fdPrematurePenaltyPercent' | 'shareDepositRatePercent' | 'depositInterestBasis'>;

function Deposits({ b, title }: { b: SettingsBundle; title: string }) {
  const ro = !b.canEdit;
  const s = b.settings;
  const form = useDraft<DepositValues>({ fdSlabs: s.fdSlabs, fdMinAmount: s.fdMinAmount, savingsRatePercent: s.savingsRatePercent, crdRatePercent: s.crdRatePercent, srdsRatePercent: s.srdsRatePercent, fdMaturityJobEnabled: s.fdMaturityJobEnabled, fdMaturityRunHour: s.fdMaturityRunHour, fdPrematureWithdrawalEnabled: s.fdPrematureWithdrawalEnabled, fdPrematurePenaltyMethod: s.fdPrematurePenaltyMethod, fdPrematurePenaltyPercent: s.fdPrematurePenaltyPercent, shareDepositRatePercent: s.shareDepositRatePercent, depositInterestBasis: s.depositInterestBasis });
  const a = useAction();
  const v = form.draft;
  const e = a.fields;
  const set = (p: Partial<DepositValues>) => form.setDraft({ ...v, ...p });
  const setSlab = (i: number, p: Partial<DepositValues['fdSlabs'][number]>) => set({ fdSlabs: v.fdSlabs.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const rateCut = v.fdPrematurePenaltyMethod === 'RATE_CUT';

  return (
    <Editor title={title} onBack={back} canEdit={b.canEdit} dirty={form.dirty} a={a} onSave={() => a.run(() => api.settings.updateValues(v))} onDiscard={form.reset}>
      <Block title="Fixed deposit rates" description="One rate per tenure band. Bands must not overlap. Preview: ₹1,00,000 paid on maturity (quarterly compounding)." tag={isPlaceholder(b, 'fdSlabs')}>
        {v.fdSlabs.map((slab, i) => {
          const m = Number.isFinite(slab.ratePercent) && slab.ratePercent > 0 && Number.isFinite(slab.fromMonths) ? calculateFdMaturity({ principal: LAKH, ratePercent: slab.ratePercent, tenureMonths: slab.fromMonths, payout: 'ON_MATURITY', openedOn: '2026-01-01' }) : undefined;
          return (
            <Card key={i}>
              <View style={{ gap: space[6] }}>
                <View style={{ flexDirection: 'row', gap: space[4] }}>
                  <View style={{ flex: 1 }}>
                    <Num label="From" value={slab.fromMonths} onChange={(fromMonths) => setSlab(i, { fromMonths })} error={e[`fdSlabs.${i}.fromMonths`]} unit="months" disabled={ro} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Num label="To" value={slab.toMonths} onChange={(toMonths) => setSlab(i, { toMonths })} error={e[`fdSlabs.${i}.toMonths`]} unit="months" disabled={ro} />
                  </View>
                </View>
                <Num label="Rate" value={slab.ratePercent} onChange={(ratePercent) => setSlab(i, { ratePercent })} error={e[`fdSlabs.${i}.ratePercent`]} unit="%" decimals disabled={ro} />
                <KeyValue label="₹1,00,000 grows to" value={m ? `${formatINR(m.maturityValue)} in ${slab.fromMonths} m` : '—'} />
                {!ro && v.fdSlabs.length > 1 ? <Button text="Remove band" subType="inline" buttonType="danger" leftSlot={Trash2} style={{ alignSelf: 'flex-start' }} onPress={() => set({ fdSlabs: v.fdSlabs.filter((_, j) => j !== i) })} /> : null}
              </View>
            </Card>
          );
        })}
        {e.fdSlabs ? (
          <Text role="caption" tone="danger">
            {e.fdSlabs}
          </Text>
        ) : null}
        {!ro ? (
          <Button
            text="Add band"
            buttonType="secondary"
            fullWidth
            leftSlot={Plus}
            onPress={() => {
              const last = v.fdSlabs.at(-1);
              const from = (last?.toMonths ?? 0) + 1;
              set({ fdSlabs: [...v.fdSlabs, { fromMonths: from, toMonths: from + 11, ratePercent: last?.ratePercent ?? 7 }] });
            }}
          />
        ) : null}
      </Block>
      <Block title="Fixed deposit minimum" description="The smallest FD the society accepts." tag={isPlaceholder(b, 'fdMinAmount')}>
        <MoneyField label="Minimum amount" value={v.fdMinAmount} onChange={(fdMinAmount) => set({ fdMinAmount })} error={e.fdMinAmount} disabled={ro} />
      </Block>
      <Block title="Other deposits" description="Annual rates credited to members' compulsory and savings deposits." tag={isPlaceholder(b, 'crdRatePercent')}>
        <Num label="CRD" value={v.crdRatePercent} onChange={(crdRatePercent) => set({ crdRatePercent })} error={e.crdRatePercent} unit="% a year" decimals disabled={ro} />
        <Num label="SRDS" value={v.srdsRatePercent} onChange={(srdsRatePercent) => set({ srdsRatePercent })} error={e.srdsRatePercent} unit="% a year" decimals disabled={ro} />
        <Num label="Savings" value={v.savingsRatePercent} onChange={(savingsRatePercent) => set({ savingsRatePercent })} error={e.savingsRatePercent} unit="% a year" decimals disabled={ro} />
        <Num label="Share deposit" value={v.shareDepositRatePercent} onChange={(shareDepositRatePercent) => set({ shareDepositRatePercent })} error={e.shareDepositRatePercent} unit="% a year" decimals disabled={ro} />
        <Choose label="Interest worked on" value={v.depositInterestBasis} options={[{ value: 'YEAR_END', label: 'Balance at the year end' }, { value: 'AVERAGE_MONTH_END', label: 'Average of the 12 month-end balances' }]} onChange={(x) => set({ depositInterestBasis: x as DepositValues['depositInterestBasis'] })} disabled={ro} />
      </Block>
      <Block title="FD maturity" description="Each day after this hour (India time) fixed deposits that have reached their maturity date are marked matured and their interest booked. Running it again changes nothing.">
        <Toggle label="Daily maturity processing" checked={v.fdMaturityJobEnabled} onChange={(fdMaturityJobEnabled) => set({ fdMaturityJobEnabled })} disabled={ro} />
        <Num label="Run after" value={v.fdMaturityRunHour} onChange={(fdMaturityRunHour) => set({ fdMaturityRunHour })} error={e.fdMaturityRunHour} unit="o'clock" hint="0 to 23" disabled={ro} />
      </Block>
      <Block title="Premature withdrawal" description={`The penalty comes only out of the interest: the member always gets the full principal back. ${rateCut ? 'Interest is paid at the FD rate less this many percentage points.' : 'This percent of the interest earned is kept as the penalty.'} 0 means no penalty.`} tag={isPlaceholder(b, 'fdPrematurePenaltyPercent') || isPlaceholder(b, 'fdPrematurePenaltyMethod')}>
        <Toggle label="Premature withdrawal allowed" checked={v.fdPrematureWithdrawalEnabled} onChange={(fdPrematureWithdrawalEnabled) => set({ fdPrematureWithdrawalEnabled })} disabled={ro} />
        <Choose label="How the penalty is worked out" value={v.fdPrematurePenaltyMethod} options={[{ value: 'RATE_CUT', label: 'Cut the interest rate by the penalty' }, { value: 'SHARE_OF_INTEREST', label: 'Take a share of the interest earned' }]} onChange={(x) => set({ fdPrematurePenaltyMethod: x as DepositValues['fdPrematurePenaltyMethod'] })} disabled={ro} />
        <Num label="Penalty" value={v.fdPrematurePenaltyPercent} onChange={(fdPrematurePenaltyPercent) => set({ fdPrematurePenaltyPercent })} error={e.fdPrematurePenaltyPercent} unit={rateCut ? 'points' : '% of interest'} decimals disabled={ro} />
      </Block>
    </Editor>
  );
}

// ---- ST-66m Insurance & demand -------------------------------------------------------------

type DemandValues = Pick<SocietySettings, 'insurance' | 'rrfMonthly' | 'crdMonthly' | 'srdsMonthly' | 'defaulterCycles' | 'suretyRecoveryAfterCycles' | 'penalGraceDays' | 'demandSendByDays' | 'minTakeHomePay'>;

function InsuranceDemand({ b, title }: { b: SettingsBundle; title: string }) {
  const ro = !b.canEdit;
  const s = b.settings;
  const form = useDraft<DemandValues>({ insurance: s.insurance, rrfMonthly: s.rrfMonthly, crdMonthly: s.crdMonthly, srdsMonthly: s.srdsMonthly, defaulterCycles: s.defaulterCycles, suretyRecoveryAfterCycles: s.suretyRecoveryAfterCycles, penalGraceDays: s.penalGraceDays, demandSendByDays: s.demandSendByDays, minTakeHomePay: s.minTakeHomePay });
  const a = useAction();
  const v = form.draft;
  const e = a.fields;
  const set = (p: Partial<DemandValues>) => form.setDraft({ ...v, ...p });
  const ph = (k: string) => isPlaceholder(b, k);
  const order = (Object.keys(HEAD_PRIORITY) as DemandHead[]).sort((x, y) => HEAD_PRIORITY[x] - HEAD_PRIORITY[y]);

  return (
    <Editor title={title} onBack={back} canEdit={b.canEdit} dirty={form.dirty} a={a} onSave={() => a.run(() => api.settings.updateValues(v))} onDiscard={form.reset}>
      <Block title="Monthly heads" description="Added to every member's demand each cycle. Changes apply from the next generated sheet." tag={ph('rrfMonthly') || ph('crdMonthly')}>
        <MoneyField label="RRF per month" value={v.rrfMonthly} onChange={(rrfMonthly) => set({ rrfMonthly })} error={e.rrfMonthly} disabled={ro} />
        <MoneyField label="CRD per month" value={v.crdMonthly} onChange={(crdMonthly) => set({ crdMonthly })} error={e.crdMonthly} disabled={ro} />
        <MoneyField label="SRDS per month" value={v.srdsMonthly} onChange={(srdsMonthly) => set({ srdsMonthly })} error={e.srdsMonthly} disabled={ro} hint="Only members with an SRDS account" />
      </Block>
      <Block title="Insurance" description="Collected once a year in the collection month." tag={ph('insurance')}>
        <MoneyField label="Members with a loan" value={v.insurance.loaneeAmount} onChange={(loaneeAmount) => set({ insurance: { ...v.insurance, loaneeAmount } })} error={e['insurance.loaneeAmount']} disabled={ro} />
        <MoneyField label="Members without a loan" value={v.insurance.nonLoaneeAmount} onChange={(nonLoaneeAmount) => set({ insurance: { ...v.insurance, nonLoaneeAmount } })} error={e['insurance.nonLoaneeAmount']} disabled={ro} />
        <Choose label="Collection month" value={String(v.insurance.collectionMonth)} options={MONTHS} onChange={(m) => set({ insurance: { ...v.insurance, collectionMonth: Number(m) } })} disabled={ro} />
      </Block>
      <Block title="Defaulters" description="A member becomes a defaulter after this many short cycles in a row." tag={ph('defaulterCycles')}>
        <Num label="Short cycles in a row" value={v.defaulterCycles} onChange={(defaulterCycles) => set({ defaulterCycles })} error={e.defaulterCycles} unit="cycles" disabled={ro} />
        <Num label="Recover from sureties after" value={v.suretyRecoveryAfterCycles} onChange={(suretyRecoveryAfterCycles) => set({ suretyRecoveryAfterCycles })} error={e.suretyRecoveryAfterCycles} unit="months in a row" hint="The sureties then pay equal shares" disabled={ro} />
      </Block>
      <Block title="Sending and deductions" description="The sheet must reach the DDO this many days before the 1st (society: 3–5). A deduction may never leave the member less than the minimum take-home pay." tag={ph('demandSendByDays') || ph('minTakeHomePay')}>
        <Num label="Send to the DDO before the 1st" value={v.demandSendByDays} onChange={(demandSendByDays) => set({ demandSendByDays })} error={e.demandSendByDays} unit="days" disabled={ro} />
        <MoneyField label="Minimum take-home pay" value={v.minTakeHomePay} onChange={(minTakeHomePay) => set({ minTakeHomePay })} error={e.minTakeHomePay} disabled={ro} hint="₹0 = only the salary limit applies" />
      </Block>
      <Block title="Penal interest" description="Simple interest per day on the unpaid loan instalment only, from the cycle's last day plus these grace days, until paid. The rate is set per loan product." tag={ph('penalGraceDays')}>
        <Num label="Grace days" value={v.penalGraceDays} onChange={(penalGraceDays) => set({ penalGraceDays })} error={e.penalGraceDays} unit="days" disabled={ro} />
      </Block>
      <Section title="Recovery priority" description="Set by the agreement (§3.6). A short salary deduction is applied top to bottom." right={<Lock size={14} color={color.text.tertiary} accessibilityLabel="Locked" />}>
        <Card>
          {order.map((h, i) => (
            <Text key={h} role="body">
              {i + 1}. {RECOVERY_LABEL[h]}
            </Text>
          ))}
        </Card>
      </Section>
    </Editor>
  );
}

// ---- ST-67m Departments --------------------------------------------------------------------

const EMPTY_DEPT: Partial<Department> = { code: '', name: '', kind: 'SECRETARY_DEPT', ddoName: '', ddoDesignation: 'Assistant Secretary to Government' };

function Departments({ canEdit, title }: { canEdit: boolean; title: string }) {
  const list = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const [editing, setEditing] = useState<Partial<Department>>();
  const a = useAction();
  const e = a.fields;
  const set = (p: Partial<Department>) => setEditing((x) => ({ ...x, ...p }));
  if (editing) {
    const close = () => setEditing(undefined);
    const save = async () => {
      const ok = await a.run(() => (editing.id ? api.settings.updateDepartment(editing.id, editing) : api.settings.createDepartment(editing)));
      if (ok) close();
      return ok;
    };
    return (
      <Editor title={editing.id ? `Edit ${editing.name}` : 'Add department'} onBack={close} canEdit dirty a={a} onSave={save} onDiscard={close} saveText="Save">
        <Text role="body" tone="secondary">
          The DDO certifies applications for members of this office and deducts their dues.
        </Text>
        <TextField label="Code" value={editing.code ?? ''} onChangeText={(code) => set({ code: code.toUpperCase() })} error={e.code} placeholder="e.g. TOUR" autoCapitalize="characters" />
        <TextField label="Name" value={editing.name ?? ''} onChangeText={(name) => set({ name })} error={e.name} placeholder="e.g. Tourism" />
        <Segmented label="Type" value={editing.kind ?? 'SECRETARY_DEPT'} options={[{ value: 'SECRETARY_DEPT', label: 'Secretariat' }, { value: 'EXTERNAL_OFFICE', label: 'Outside' }]} onChange={(kind) => set({ kind: kind as Department['kind'] })} />
        {editing.kind === 'EXTERNAL_OFFICE' ? (
          <Text role="caption" tone="tertiary">
            For members transferred outside the Secretariat (recovery mandate moves here).
          </Text>
        ) : null}
        <TextField label="DDO name" value={editing.ddoName ?? ''} onChangeText={(ddoName) => set({ ddoName })} error={e.ddoName} />
        <TextField label="DDO designation" value={editing.ddoDesignation ?? ''} onChangeText={(ddoDesignation) => set({ ddoDesignation })} error={e.ddoDesignation} />
      </Editor>
    );
  }
  return (
    <Screen header={<Header title={title} onBack={back} />} {...(canEdit ? { footer: <Button text="Add department" size="lg" fullWidth leftSlot={Plus} onPress={() => setEditing({ ...EMPTY_DEPT })} /> } : {})}>
      <Loaded q={list} what="departments">
        {(rows) => (
          <>
            <Text role="body" tone="secondary">
              {rows.length} offices. DDOs certify membership and loan applications and deduct dues from salary.
            </Text>
            <Stack2>
              {rows.map((r) => (
                <RecordCard key={r.id} title={r.name} subtitle={`${r.code} · ${r.memberCount} members`} caption={`DDO ${r.ddoName}, ${r.ddoDesignation}`} {...(canEdit ? { onPress: () => setEditing(r) } : {})}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    <Tag text={r.ddoUserId ? 'Has login' : 'No login yet'} color={r.ddoUserId ? 'success' : 'neutral'} size="xs" />
                    {r.kind === 'EXTERNAL_OFFICE' ? <Tag text="Outside Secretariat" color="neutral" size="xs" /> : null}
                  </View>
                </RecordCard>
              ))}
            </Stack2>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

// ---- ST-61m Users --------------------------------------------------------------------------

/** Extra sign-in facts the backend adds to each user (docs/22 §5.1). */
type BackendUser = StaffUser & { totpEnabled?: boolean; locked?: boolean; lastLoginAt?: string };

function SignIn({ user }: { user: BackendUser }) {
  const qc = useQueryClient();
  const reset = useMutation({ mutationFn: () => api.settings.resetUserPassword(user.id) });
  const resetTotp = useMutation({ mutationFn: () => api.settings.resetUserTotp(user.id), onSuccess: (list) => qc.setQueryData(['users'], list) });
  const failure = reset.error ?? resetTotp.error;
  return (
    <Section title="Sign-in">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Tag text={user.totpEnabled ? 'Authenticator set up' : 'No authenticator'} color={user.totpEnabled ? 'success' : 'neutral'} size="xs" />
        {user.locked ? <Tag text="Locked after wrong attempts" color="warning" size="xs" /> : null}
      </View>
      <Text role="caption" tone="secondary">
        {user.lastLoginAt ? `Last signed in ${formatDisplayDateTime(user.lastLoginAt)}` : 'Has not signed in yet.'}
      </Text>
      <Button text="Reset password" buttonType="secondary" fullWidth loading={reset.isPending} onPress={() => void ask('Reset password', `${user.name} gets a temporary password that works once.`, 'Reset').then((ok) => ok && reset.mutate())} />
      {user.totpEnabled ? <Button text="Reset authenticator" buttonType="secondary" fullWidth loading={resetTotp.isPending} onPress={() => void ask('Reset authenticator', `${user.name} sets up a new authenticator app at the next sign-in.`, 'Reset').then((ok) => ok && resetTotp.mutate())} /> : null}
      {reset.data ? <Alert type="success" heading={`Temporary password for ${reset.data.userId}: ${reset.data.temporaryPassword}`} description="Give it to the user in person. It works once: they choose a new password when they sign in. It is not shown again." /> : null}
      {resetTotp.isSuccess ? <Alert type="success" heading="Authenticator reset" description="The user sets up a new authenticator app at the next sign-in." /> : null}
      {failure ? <Alert type="error" heading="That didn't work" description={isApiError(failure) ? failure.message : 'Try again.'} /> : null}
    </Section>
  );
}

function Users({ canEdit, title }: { canEdit: boolean; title: string }) {
  const users = useQuery({ queryKey: ['users'], queryFn: api.settings.users });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const [editing, setEditing] = useState<Partial<StaffUser>>();
  const a = useAction();
  const e = a.fields;
  const set = (p: Partial<StaffUser>) => setEditing((x) => ({ ...x, ...p }));
  const deptName = (id?: string) => depts.data?.find((d) => d.id === id)?.name;
  if (editing) {
    const close = () => setEditing(undefined);
    const save = async () => {
      const ok = await a.run(() => (editing.id ? api.settings.updateUser(editing.id, editing) : api.settings.createUser(editing)));
      if (ok) close();
      return ok;
    };
    return (
      <Editor title={editing.id ? `Edit ${editing.name}` : 'Add user'} onBack={close} canEdit dirty a={a} onSave={save} onDiscard={close} saveText="Save">
        <Text role="body" tone="secondary">
          New users get a temporary password from Reset password, and choose their own at first sign-in.
        </Text>
        <TextField label="Full name" value={editing.name ?? ''} onChangeText={(name) => set({ name })} error={e.name} />
        <TextField label="User ID" value={editing.userId ?? ''} onChangeText={(userId) => set({ userId: userId.toLowerCase() })} error={e.userId} placeholder="e.g. ddo.gad" autoCapitalize="none" autoCorrect={false} />
        <TextField label="Mobile (optional)" keyboardType="phone-pad" value={editing.mobile ?? ''} onChangeText={(mobile) => set({ mobile: mobile.replace(/\D/g, '').slice(0, 10) })} error={e.mobile} />
        <TextField label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={editing.email ?? ''} onChangeText={(email) => set({ email })} error={e.email} />
        <SelectField label="Role" value={editing.role ?? ''} options={CONSOLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], hint: ROLE_HINT[r] }))} onChange={(role) => set({ role: role as ConsoleRole })} error={e.role} />
        {editing.role === 'DDO' ? <SelectField label="Department" searchable value={editing.departmentId ?? ''} options={(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))} onChange={(departmentId) => set({ departmentId })} error={e.departmentId} /> : null}
        {editing.id ? <Checkbox checked={editing.active !== false} onChange={(active) => set({ active })} label="Can sign in" {...(e.active ? { description: e.active } : {})} /> : null}
        {editing.id && 'totpEnabled' in editing ? <SignIn user={editing as BackendUser} /> : null}
      </Editor>
    );
  }
  return (
    <Screen header={<Header title={title} onBack={back} />} {...(canEdit ? { footer: <Button text="Add user" size="lg" fullWidth leftSlot={Plus} onPress={() => setEditing({ role: 'ACCOUNTANT', active: true })} /> } : {})}>
      <Text role="body" tone="secondary">
        Staff sign in to the console or to these staff screens. Members never see them.
      </Text>
      <Loaded q={users} what="users">
        {(rows) => (
          <>
            <Stack2>
              {rows.map((r) => (
                <RecordCard key={r.id} title={r.name} subtitle={r.userId} caption={[ROLE_LABELS[r.role], deptName(r.departmentId)].filter(Boolean).join(' · ')} tag={<Tag text={r.active === false ? 'Inactive' : 'Active'} color={r.active === false ? 'neutral' : 'success'} size="xs" />} {...(canEdit ? { onPress: () => setEditing(r) } : {})} />
              ))}
            </Stack2>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

// ---- ST-62m Permissions --------------------------------------------------------------------

function Permissions({ title }: { title: string }) {
  const q = useQuery({ queryKey: ['permissions'], queryFn: api.settings.permissions });
  const [role, setRole] = useState<string>();
  return (
    <Screen header={<Header title={title} onBack={back} />}>
      <Loaded q={q} what="permissions">
        {(m) => {
          const current = role ?? m.roles[0]?.role ?? '';
          const groups = [...new Set(m.permissions.map((p) => p.group))];
          return (
            <>
              <Text role="body" tone="secondary">
                Fixed by role. Approvals are also limited by stage: each person can only act on the step that belongs to their role, and the President must be a different person from the Secretary.
              </Text>
              <SelectField label="Role" value={current} options={m.roles.map((r) => ({ value: r.role, label: r.label }))} onChange={setRole} />
              {groups.map((g) => (
                <Section key={g} title={g}>
                  <Card>
                    {m.permissions
                      .filter((p) => p.group === g)
                      .map((p) => {
                        const yes = !!m.grants[current]?.includes(p.key);
                        const Icon = yes ? Check : Minus;
                        return (
                          <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }} accessible accessibilityLabel={`${p.label}: ${yes ? 'yes' : 'no'}`}>
                            <Text role="body" tone={yes ? 'primary' : 'tertiary'} style={{ flex: 1 }}>
                              {p.label}
                            </Text>
                            <Icon size={16} color={yes ? color.status.success.fg : color.text.tertiary} />
                          </View>
                        );
                      })}
                  </Card>
                </Section>
              ))}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

// ---- ST-63m Templates ----------------------------------------------------------------------

function TemplateEdit({ t, onClose }: { t: NotificationTemplate; onClose: () => void }) {
  const [x, setX] = useState(t);
  const a = useAction();
  const save = async () => {
    const ok = await a.run(() => api.settings.updateTemplate(x.key, x));
    if (ok) onClose();
    return ok;
  };
  return (
    <Editor title={plain(t.event)} onBack={onClose} canEdit dirty={JSON.stringify(x) !== JSON.stringify(t)} a={a} onSave={save} onDiscard={() => setX(t)} saveText="Save template">
      <Text role="body" tone="secondary">
        Use the placeholders listed. They are filled in when the message is sent.
      </Text>
      <TextField label="Title" value={x.title} onChangeText={(title) => setX({ ...x, title })} error={a.fields.title} />
      <TextField label="Message" value={x.body} onChangeText={(body) => setX({ ...x, body })} multiline numberOfLines={4} error={a.fields.body} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {vars(t).map((v) => (
          <Button key={v} text={`{${v}}`} size="sm" buttonType="secondary" accessibilityLabel={`Add ${v}`} onPress={() => setX({ ...x, body: `${x.body} {${v}}` })} />
        ))}
      </View>
      <Section title="Send by">
        {CHANNELS.map((c) => (
          <Checkbox key={c.id} checked={x.channels.includes(c.id)} onChange={(on) => setX({ ...x, channels: on ? [...x.channels, c.id] : x.channels.filter((y) => y !== c.id) })} label={c.label} />
        ))}
        {a.fields.channels ? (
          <Text role="caption" tone="danger">
            {a.fields.channels}
          </Text>
        ) : null}
      </Section>
      <Section title="Preview">
        <Card>
          <Text role="label">{fill(x.title)}</Text>
          <Text role="body" tone="secondary">
            {fill(x.body)}
          </Text>
        </Card>
      </Section>
    </Editor>
  );
}

function Templates({ canEdit, title }: { canEdit: boolean; title: string }) {
  const q = useQuery({ queryKey: ['templates'], queryFn: api.settings.templates });
  const [editing, setEditing] = useState<NotificationTemplate>();
  if (editing) return <TemplateEdit t={editing} onClose={() => setEditing(undefined)} />;
  return (
    <Screen header={<Header title={title} onBack={back} />}>
      <Loaded q={q} what="templates">
        {(rows) => (
          <>
            <Stack2>
              {rows.map((t) => (
                <RecordCard key={t.key} title={plain(t.event)} subtitle={AUDIENCE[t.audience]} caption={`${fill(t.title)}: ${fill(t.body)}`} {...(canEdit ? { onPress: () => setEditing(t) } : {})}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    {CHANNELS.map((c) => (
                      <Tag key={c.id} text={`${c.label}: ${t.channels.includes(c.id) ? 'on' : 'off'}`} color={t.channels.includes(c.id) ? 'primary' : 'neutral'} size="xs" />
                    ))}
                  </View>
                </RecordCard>
              ))}
            </Stack2>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

// ---- ST-68m Change history -----------------------------------------------------------------

/** The server names settings by their field: rrfMonthly reads as RRF monthly. */
const readable = (text: string) => text.replace(/\b[a-z]+[A-Z][A-Za-z]*\b/g, (w) => w.replace(/([A-Z])/g, ' $1').toLowerCase()).replace(/\b(rrf|crd|srds|fd)\b/g, (w) => w.toUpperCase());

function ChangeHistory({ b, title }: { b: SettingsBundle; title: string }) {
  return (
    <Screen header={<Header title={title} onBack={back} />}>
      {!b.recentChanges.length ? (
        <EmptyState icon={Lock} title="No changes yet" description="Every saved change to settings, users, departments or templates appears here with the person and time." />
      ) : (
        <Stack2>
          {b.recentChanges.map((c) => (
            <View key={c.id} style={{ gap: space[1], padding: space[8] }}>
              <Text role="body">{readable(c.summary)}</Text>
              <Text role="caption" tone="tertiary">
                {ENTITY[c.entity] ?? c.entity} · {c.actorName} · {formatDisplayDateTime(c.at)}
              </Text>
            </View>
          ))}
        </Stack2>
      )}
    </Screen>
  );
}

// ---- Route ---------------------------------------------------------------------------------

export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const q = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const meta = SECTIONS.find((s) => s.id === section);
  const title = meta?.label ?? 'Settings';
  const b = q.data;
  if (!b || !meta)
    return (
      <Screen header={<Header title={title} onBack={back} />}>
        {!meta ? (
          <Alert type="neutral" heading="Not found" description="Pick a section from Settings." />
        ) : (
          <Loaded q={q} what="settings">
            {() => null}
          </Loaded>
        )}
      </Screen>
    );
  switch (section) {
    case 'general':
      return <General b={b} title={title} />;
    case 'loan-products':
      return <LoanProducts b={b} title={title} />;
    case 'deposits':
      return <Deposits b={b} title={title} />;
    case 'insurance-demand':
      return <InsuranceDemand b={b} title={title} />;
    case 'departments':
      return <Departments canEdit={b.canEdit} title={title} />;
    case 'users':
      return <Users canEdit={b.canEdit} title={title} />;
    case 'permissions':
      return <Permissions title={title} />;
    case 'templates':
      return <Templates canEdit={b.canEdit} title={title} />;
    default:
      return <ChangeHistory b={b} title={title} />;
  }
}
