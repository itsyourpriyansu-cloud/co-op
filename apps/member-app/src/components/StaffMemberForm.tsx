// ST-11m Member create / edit, one topic per step. Sections follow the paper Membership form.
// Left-over service is computed, never typed (BR-001). In edit mode department and shares are locked.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { calculateLeftoverService, expectedRetirementDate, formatDisplayDate, formatINR, validateMemberInput } from '@tgs/domain';
import type { Address, MemberDetail, MemberInput, SocietySettings } from '@tgs/types';
import { ActionAlert, Loaded, MoneyField, useAction, useToday } from '@/components/staff';
import { api } from '@/lib/api';
import { emptyMemberInput, memberToInput, RELATIONS } from '@/lib/staffMembers';
import { Alert, Button, Card, Checkbox, DateField, Header, KeyValue, Screen, Segmented, SelectField, TextField, WizardProgress } from '@/ui';
import { space } from '@/theme';

const STEPS = ['Personal', 'Address', 'Employment & service', 'Nominee', 'Shares', 'Pay profile'];
/** Which step holds each field, to jump to the first problem. */
const stepOf = (key: string) => (/^(presentAddress|permanentAddress)/.test(key) ? 1 : /^(employeeId|departmentId|designation|doj|dor|employmentType)/.test(key) ? 2 : /^nominee/.test(key) ? 3 : /^numberOfShares/.test(key) ? 4 : /^payProfile/.test(key) ? 5 : 0);
const safe = <T,>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

function AddressFields({ prefix, value, onChange, errors }: { prefix: string; value: Address; onChange: (a: Address) => void; errors: Record<string, string> }) {
  const set = (p: Partial<Address>) => onChange({ ...value, ...p });
  return (
    <>
      <TextField label="House / street" required value={value.line1} onChangeText={(v) => set({ line1: v })} error={errors[`${prefix}.line1`]} />
      <TextField label="City / town" required value={value.city} onChangeText={(v) => set({ city: v })} error={errors[`${prefix}.city`]} />
      <TextField label="District" value={value.district} onChangeText={(v) => set({ district: v })} error={errors[`${prefix}.district`]} />
      <TextField label="PIN code" required keyboardType="number-pad" value={value.pincode} onChangeText={(v) => set({ pincode: v.replace(/\D/g, '').slice(0, 6) })} error={errors[`${prefix}.pincode`]} />
    </>
  );
}

export function StaffMemberForm({ id }: { id?: string }) {
  const existing = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id!), enabled: !!id });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  if (id)
    return (
      <Loaded q={existing} what="this member">
        {(d) => <Loaded q={settings} what="the society's settings">{(s) => <Form d={d} s={s.settings} id={id} />}</Loaded>}
      </Loaded>
    );
  return <Loaded q={settings} what="the society's settings">{(s) => <Form s={s.settings} />}</Loaded>;
}

function Form({ d, s, id }: { d?: MemberDetail; s: SocietySettings; id?: string }) {
  const editing = !!id;
  const today = useToday();
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const reference = useQuery({ queryKey: ['joining-reference'], queryFn: api.joining.reference, staleTime: 60 * 60_000 });
  const [v, setV] = useState<MemberInput>(() => (d ? memberToInput(d.member) : emptyMemberInput()));
  const [same, setSame] = useState(() => (d ? JSON.stringify(memberToInput(d.member).presentAddress) === JSON.stringify(memberToInput(d.member).permanentAddress) : true));
  const [dorTouched, setDorTouched] = useState(editing);
  const [step, setStep] = useState(0);
  const [local, setLocal] = useState<Record<string, string>>({});
  const a = useAction();
  const errors = { ...local, ...a.fields };
  const set = (p: Partial<MemberInput>) => setV((x) => ({ ...x, ...p }));

  const suggestedDor = v.dob ? safe(() => expectedRetirementDate(v.dob, s.retirementAge)) : undefined;
  useEffect(() => {
    if (!dorTouched && suggestedDor) setV((x) => ({ ...x, dor: suggestedDor }));
  }, [suggestedDor, dorTouched]);
  const leftover = v.dor ? safe(() => calculateLeftoverService(v.dor, today).label) : undefined;
  const designations = useMemo(() => {
    const list = reference.data?.designations ?? [];
    return (v.designation && !list.includes(v.designation) ? [v.designation, ...list] : list).map((x) => ({ label: x, value: x }));
  }, [reference.data, v.designation]);

  const submit = async () => {
    const input: MemberInput = { ...v, permanentAddress: same ? v.presentAddress : v.permanentAddress };
    const problems = validateMemberInput(input, { today, minShares: s.minShares, maxShares: s.maxShares, others: [], casteCategories: s.casteCategories });
    setLocal(problems);
    const first = Object.keys(problems)[0];
    if (first) return setStep(stepOf(first));
    let saved: MemberDetail | undefined;
    const ok = await a.run(async () => {
      saved = editing ? await api.members.update(id!, input) : await api.members.create(input);
    });
    if (ok && saved) router.replace(`/staff/member/${saved.member.id}`);
  };
  useEffect(() => {
    const first = Object.keys(a.fields)[0];
    if (first) setStep(stepOf(first));
  }, [a.fields]);

  const last = step === STEPS.length - 1;
  const problemCount = Object.keys(errors).length;

  return (
    <Screen
      header={<Header title={editing ? `Edit ${d?.member.name ?? 'member'}` : 'New member'} onBack={() => (step ? setStep(step - 1) : router.back())} />}
      footer={<Button text={!last ? 'Continue' : editing ? 'Save changes' : 'Add member'} size="lg" fullWidth loading={a.busy} disabled={a.busy || a.unconfirmed} onPress={() => (last ? void submit() : setStep(step + 1))} />}
    >
      <WizardProgress step={step + 1} total={STEPS.length} title={STEPS[step]!} />
      {problemCount ? <Alert type="warning" heading="Some details need attention" description={`${problemCount} field${problemCount === 1 ? '' : 's'} highlighted.`} /> : null}

      {step === 0 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Full name" required value={v.name} onChangeText={(x) => set({ name: x })} error={errors.name} />
          <TextField label="Father's name" required value={v.fatherName} onChangeText={(x) => set({ fatherName: x })} error={errors.fatherName} />
          <DateField label="Date of birth" required value={v.dob} onChange={(x) => set({ dob: x ?? '' })} error={errors.dob} />
          <Segmented label="Gender" value={v.gender} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} onChange={(x) => set({ gender: x as 'F' | 'M' })} />
          <SelectField label="Caste" placeholder="Choose category" value={v.caste ?? ''} options={s.casteCategories.map((c) => ({ value: c, label: c }))} onChange={(x) => set({ caste: x })} error={errors.caste} />
          <TextField label="Mobile" required keyboardType="phone-pad" prefix="+91" value={v.mobile} onChangeText={(x) => set({ mobile: x.replace(/\D/g, '').slice(0, 10) })} hint="10 digits. The member signs in to the app with it." error={errors.mobile} />
          <TextField label="Email" keyboardType="email-address" autoCapitalize="none" value={v.email ?? ''} onChangeText={(x) => set({ email: x })} hint="Optional" error={errors.email} />
          <DateField label="Wedding anniversary" value={v.anniversaryDate} onChange={(x) => set(x ? { anniversaryDate: x } : { anniversaryDate: undefined })} hint="Optional (greetings)" error={errors.anniversaryDate} />
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: space[8] }}>
          <AddressFields prefix="presentAddress" value={v.presentAddress} onChange={(x) => set({ presentAddress: x })} errors={errors} />
          <Checkbox checked={same} onChange={setSame} label="Permanent address is the same" />
          {!same ? <AddressFields prefix="permanentAddress" value={v.permanentAddress} onChange={(x) => set({ permanentAddress: x })} errors={errors} /> : null}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Employee ID" required autoCapitalize="characters" value={v.employeeId} onChangeText={(x) => set({ employeeId: x.toUpperCase() })} error={errors.employeeId} />
          {editing ? (
            <KeyValue label="Department" value={d?.department?.name ?? ''} />
          ) : (
            <SelectField label="Department" required searchable placeholder="Choose department" value={v.departmentId} options={(depts.data ?? []).map((x) => ({ value: x.id, label: x.name }))} onChange={(x) => set({ departmentId: x })} error={errors.departmentId} />
          )}
          <SelectField label="Designation" required searchable placeholder="Choose designation" value={v.designation} options={designations} onChange={(x) => set({ designation: x })} error={errors.designation} />
          <Segmented label="Employment type" value={v.employmentType} options={[{ value: 'REGULAR', label: 'Regular' }, { value: 'APPROVED_PROBATIONER', label: 'Probationer' }]} onChange={(x) => set({ employmentType: x as MemberInput['employmentType'] })} />
          <DateField label="Date of joining service" required value={v.doj} onChange={(x) => set({ doj: x ?? '' })} error={errors.doj} />
          <DateField
            key={dorTouched ? 'typed' : v.dor}
            label="Date of retirement"
            required
            value={v.dor}
            onChange={(x) => {
              setDorTouched(true);
              set({ dor: x ?? '' });
            }}
            error={errors.dor}
            hint={suggestedDor && v.dor !== suggestedDor ? `Retirement age ${s.retirementAge} gives ${formatDisplayDate(suggestedDor)}` : suggestedDor ? `From the date of birth at age ${s.retirementAge}` : undefined}
          />
          <Card>
            <KeyValue label="Left-over service" value={leftover ?? 'Enter the date of retirement'} />
          </Card>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Nominee name" required value={v.nominee.name} onChangeText={(x) => set({ nominee: { ...v.nominee, name: x } })} error={errors['nominee.name']} />
          <SelectField label="Relation" value={v.nominee.relation} options={RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(x) => set({ nominee: { ...v.nominee, relation: x as MemberInput['nominee']['relation'] } })} />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Number of shares" keyboardType="number-pad" editable={!editing} value={Number.isFinite(v.numberOfShares) ? String(v.numberOfShares) : ''} onChangeText={(x) => set({ numberOfShares: x === '' ? Number.NaN : Number(x.replace(/\D/g, '')) })} error={errors.numberOfShares} hint={editing ? 'Shares change through a share purchase, not an edit.' : `Between ${s.minShares} and ${s.maxShares} shares of ${formatINR(s.shareValue)} each.`} />
          <Card>
            <KeyValue label="Share capital" value={Number.isFinite(v.numberOfShares) ? formatINR(v.numberOfShares * s.shareValue) : '—'} />
          </Card>
        </View>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Scale of pay" placeholder="e.g. 24280-72850" value={v.payProfile.scaleOfPay} onChangeText={(x) => set({ payProfile: { ...v.payProfile, scaleOfPay: x } })} error={errors['payProfile.scaleOfPay']} />
          <MoneyField label="Gross salary (monthly)" value={v.payProfile.grossSalary} onChange={(x) => set({ payProfile: { ...v.payProfile, grossSalary: x } })} error={errors['payProfile.grossSalary']} />
          <MoneyField label="Substantive pay" value={v.payProfile.substantivePay} onChange={(x) => set({ payProfile: { ...v.payProfile, substantivePay: x } })} error={errors['payProfile.substantivePay']} />
          <MoneyField label="Government loan deductions" value={v.payProfile.govtLoanDeductions} onChange={(x) => set({ payProfile: { ...v.payProfile, govtLoanDeductions: x } })} error={errors['payProfile.govtLoanDeductions']} />
        </View>
      ) : null}

      <ActionAlert action={a} heading="Not saved" check={{ text: 'Check Members', href: '/staff/members' }} />
    </Screen>
  );
}
