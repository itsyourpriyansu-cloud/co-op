// ST-11 Member create / edit (J-09). Sections follow the paper Membership form: personal, address,
// employment & service, nominee, shares, pay. Left-over service is computed, never typed (BR-001).
// In edit mode the department and shares are locked: departments change by transfer (ST-13).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserX } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  Checkbox,
  CheckboxSize,
  Radio,
  RadioGroup,
  SingleSelectV2,
  SnackbarV2Variant,
  TextInputV2,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { calculateLeftoverService, expectedRetirementDate, formatDisplayDate, formatINR, validateMemberInput } from '@tgs/domain';
import type { Address, MemberInput } from '@tgs/types';
import { FormSection, MoneyField, NumberField, TextField, fieldErrorsOf, type FieldErrors } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { emptyMemberInput, memberToInput, RELATIONS } from './members';

function DateInput({ label, value, onChange, errors, name, hint, required, disabled }: { label: string; value: string; onChange: (v: string) => void; errors: FieldErrors; name: string; hint?: string; required?: boolean; disabled?: boolean }) {
  return (
    <TextInputV2
      label={label}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      error={errors[name] ? { show: true, message: errors[name] } : undefined}
      {...(hint ? { hintText: hint } : {})}
    />
  );
}

function AddressFields({ prefix, value, onChange, errors, disabled }: { prefix: 'presentAddress' | 'permanentAddress'; value: Address; onChange: (a: Address) => void; errors: FieldErrors; disabled?: boolean }) {
  const set = (p: Partial<Address>) => onChange({ ...value, ...p });
  return (
    <>
      <div className="sm:col-span-2">
        <TextField label="House / street" name={`${prefix}.line1`} value={value.line1} onChange={(v) => set({ line1: v })} errors={errors} required disabled={disabled} />
      </div>
      <TextField label="City / town" name={`${prefix}.city`} value={value.city} onChange={(v) => set({ city: v })} errors={errors} required disabled={disabled} />
      <TextField label="District" name={`${prefix}.district`} value={value.district} onChange={(v) => set({ district: v })} errors={errors} disabled={disabled} />
      <TextField label="PIN code" name={`${prefix}.pincode`} value={value.pincode} onChange={(v) => set({ pincode: v.replace(/\D/g, '').slice(0, 6) })} errors={errors} required disabled={disabled} />
    </>
  );
}

export function MemberFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id!), enabled: editing });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const reference = useQuery({ queryKey: ['joining-reference'], queryFn: api.joining.reference, staleTime: 60 * 60_000 });
  const demo = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const [v, setV] = useState<MemberInput>(emptyMemberInput);
  const [sameAddress, setSameAddress] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dorTouched, setDorTouched] = useState(false);

  useEffect(() => {
    if (existing.data) {
      const input = memberToInput(existing.data.member);
      setV(input);
      setSameAddress(JSON.stringify(input.presentAddress) === JSON.stringify(input.permanentAddress));
      setDorTouched(true);
    }
  }, [existing.data]);

  const s = settings.data?.settings;
  // The demo clock, not the laptop's date, drives ages and left-over service.
  const today = demo.data?.today ?? '';
  const set = (p: Partial<MemberInput>) => setV((x) => ({ ...x, ...p }));

  // BR-001: suggest the DOR from the DOB until the user types one; show left-over service live.
  const suggestedDor = v.dob && s ? safe(() => expectedRetirementDate(v.dob, s.retirementAge)) : undefined;
  useEffect(() => {
    if (!dorTouched && suggestedDor) setV((x) => ({ ...x, dor: suggestedDor }));
  }, [suggestedDor, dorTouched]);
  const leftover = v.dor ? safe(() => calculateLeftoverService(v.dor, today || v.dor).label) : undefined;
  const designations = useMemo(() => {
    const list = reference.data?.designations ?? [];
    return (v.designation && !list.includes(v.designation) ? [v.designation, ...list] : list).map((d) => ({ label: d, value: d }));
  }, [reference.data, v.designation]);

  const save = useMutation({
    mutationFn: (input: MemberInput) => (editing ? api.members.update(id!, input) : api.members.create(input)),
    onSuccess: (d) => {
      qc.setQueryData(['member', d.member.id], d);
      void qc.invalidateQueries({ queryKey: ['members'] });
      addSnackbarV2({ header: editing ? 'Member updated' : `Member added · General No. ${d.member.generalNo}`, description: d.member.name, variant: SnackbarV2Variant.SUCCESS });
      navigate(`/members/${d.member.id}`);
    },
    onError: (e) => setErrors(fieldErrorsOf(e)),
  });

  const submit = () => {
    const input: MemberInput = { ...v, permanentAddress: sameAddress ? v.presentAddress : v.permanentAddress };
    // Client check first for instant feedback; the server repeats it (incl. duplicates).
    const local = s ? validateMemberInput(input, { today: today || '2026-10-24', minShares: s.minShares, maxShares: s.maxShares, others: [] }) : {};
    setErrors(local);
    if (Object.keys(local).length) {
      addSnackbarV2({ header: 'Some details need attention', description: `${Object.keys(local).length} field(s) highlighted`, variant: SnackbarV2Variant.WARNING });
      return;
    }
    save.mutate(input);
  };

  const notFound = isApiError(existing.error) && existing.error.status === 404;
  const shareValue = s?.shareValue ?? 10000;
  const back = () => navigate(editing ? `/members/${id}` : '/members');

  return (
    <>
      <ButtonV2 text={editing ? 'Profile' : 'Members'} buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={back} />
      <div className="mt-3">
        <PageHeader
          title={editing ? `Edit ${existing.data?.member.name ?? 'member'}` : 'New member'}
          description={editing ? 'Corrections to the member master. Every change is recorded in the service history.' : 'Enter the details from the signed Membership form. The General No. is allotted when you save.'}
        />
      </div>
      <ViewState
        state={(editing && existing.isLoading) || settings.isLoading ? 'loading' : notFound ? 'empty' : existing.isError || settings.isError ? 'error' : 'ready'}
        layout="form"
        onRetry={() => void existing.refetch()}
        empty={{ icon: UserX, title: 'Member not found', action: { label: 'Back to Members', onClick: () => navigate('/members') } }}
      >
        <div className="flex max-w-5xl flex-col gap-5 pb-24">
          {save.isError && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}

          <FormSection title="1 · Personal" description="As in the service register.">
            <TextField label="Full name" name="name" value={v.name} onChange={(x) => set({ name: x })} errors={errors} required />
            <TextField label="Father's name" name="fatherName" value={v.fatherName} onChange={(x) => set({ fatherName: x })} errors={errors} required />
            <DateInput label="Date of birth" name="dob" value={v.dob} onChange={(x) => set({ dob: x })} errors={errors} required />
            <div>
              <p className="mb-2 text-label text-fg">Gender</p>
              <RadioGroup name="gender" value={v.gender} onChange={(x) => set({ gender: x as 'F' | 'M' })}>
                <div className="flex gap-6">
                  <Radio value="F">Female</Radio>
                  <Radio value="M">Male</Radio>
                </div>
              </RadioGroup>
            </div>
            <TextField label="Mobile" name="mobile" value={v.mobile} onChange={(x) => set({ mobile: x.replace(/\D/g, '').slice(0, 10) })} errors={errors} hint="10 digits. The member signs in to the app with it." required />
            <TextField label="Email" name="email" value={v.email ?? ''} onChange={(x) => set({ email: x })} errors={errors} hint="Optional" />
            <DateInput label="Wedding anniversary" name="anniversaryDate" value={v.anniversaryDate ?? ''} onChange={(x) => set(x ? { anniversaryDate: x } : { anniversaryDate: undefined })} errors={errors} hint="Optional (greetings)" />
          </FormSection>

          <FormSection title="2 · Address">
            <p className="text-label text-fg sm:col-span-2">Present address</p>
            <AddressFields prefix="presentAddress" value={v.presentAddress} onChange={(a) => set({ presentAddress: a })} errors={errors} />
            <div className="sm:col-span-2">
              <Checkbox checked={sameAddress} onCheckedChange={(x) => setSameAddress(x === true)} size={CheckboxSize.MEDIUM}>
                Permanent address is the same
              </Checkbox>
            </div>
            {!sameAddress && (
              <>
                <p className="text-label text-fg sm:col-span-2">Permanent address</p>
                <AddressFields prefix="permanentAddress" value={v.permanentAddress} onChange={(a) => set({ permanentAddress: a })} errors={errors} />
              </>
            )}
          </FormSection>

          <FormSection title="3 · Employment & service" description="Left-over service is worked out from the date of retirement (BR-001).">
            <TextField label="Employee ID" name="employeeId" value={v.employeeId} onChange={(x) => set({ employeeId: x.toUpperCase() })} errors={errors} required />
            <div>
              <SingleSelectV2
                label="Department"
                placeholder="Choose department"
                items={[{ items: (depts.data ?? []).map((d) => ({ label: d.name, value: d.id })) }]}
                selected={v.departmentId}
                onSelect={(x) => set({ departmentId: x })}
                search={{ show: true, placeholder: 'Search departments' }}
                disabled={editing}
                {...(errors.departmentId ? { error: { show: true, message: errors.departmentId } } : {})}
              />
              {editing && <p className="mt-1 text-caption text-fg-tertiary">Change the department with Transfer on the profile.</p>}
            </div>
            <SingleSelectV2 label="Designation" placeholder="Choose designation" items={[{ items: designations }]} selected={v.designation} onSelect={(x) => set({ designation: x })} search={{ show: true, placeholder: 'Search' }} {...(errors.designation ? { error: { show: true, message: errors.designation } } : {})} />
            <div>
              <p className="mb-2 text-label text-fg">Employment type</p>
              <RadioGroup name="employmentType" value={v.employmentType} onChange={(x) => set({ employmentType: x as MemberInput['employmentType'] })}>
                <div className="flex gap-6">
                  <Radio value="REGULAR">Regular</Radio>
                  <Radio value="APPROVED_PROBATIONER">Approved probationer</Radio>
                </div>
              </RadioGroup>
            </div>
            <DateInput label="Date of joining service" name="doj" value={v.doj} onChange={(x) => set({ doj: x })} errors={errors} required />
            <DateInput
              label="Date of retirement"
              name="dor"
              value={v.dor}
              onChange={(x) => {
                setDorTouched(true);
                set({ dor: x });
              }}
              errors={errors}
              required
              hint={suggestedDor && v.dor !== suggestedDor ? `Retirement age ${s?.retirementAge} gives ${formatDisplayDate(suggestedDor)}` : suggestedDor ? `From the date of birth at age ${s?.retirementAge}` : undefined}
            />
            <div className="rounded-control bg-surface-subtle px-4 py-3 sm:col-span-2">
              <p className="text-caption text-fg-tertiary">Left-over service</p>
              <p className="text-label text-fg">{leftover ?? 'Enter the date of retirement'}</p>
            </div>
          </FormSection>

          <FormSection title="4 · Nominee">
            <TextField label="Nominee name" name="nominee.name" value={v.nominee.name} onChange={(x) => set({ nominee: { ...v.nominee, name: x } })} errors={errors} required />
            <SingleSelectV2 label="Relation" placeholder="Relation" items={[{ items: RELATIONS.map((r) => ({ label: r, value: r })) }]} selected={v.nominee.relation} onSelect={(x) => set({ nominee: { ...v.nominee, relation: x as MemberInput['nominee']['relation'] } })} />
          </FormSection>

          <FormSection title="5 · Shares" description={editing ? 'Shares change through a share purchase, not an edit.' : `Between ${s?.minShares ?? 10} and ${s?.maxShares ?? 100} shares of ${formatINR(shareValue)} each.`}>
            <NumberField label="Number of shares" name="numberOfShares" value={v.numberOfShares} onChange={(x) => set({ numberOfShares: x })} errors={errors} disabled={editing} />
            <div className="rounded-control bg-surface-subtle px-4 py-3">
              <p className="text-caption text-fg-tertiary">Share capital</p>
              <p className="tabular text-label text-fg">{Number.isFinite(v.numberOfShares) ? formatINR(v.numberOfShares * shareValue) : '—'}</p>
            </div>
          </FormSection>

          <FormSection title="6 · Pay profile" description="Used for loan eligibility. The DDO certifies changes later.">
            <TextField label="Scale of pay" name="payProfile.scaleOfPay" value={v.payProfile.scaleOfPay} onChange={(x) => set({ payProfile: { ...v.payProfile, scaleOfPay: x } })} errors={errors} placeholder="e.g. 24280-72850" />
            <MoneyField label="Gross salary (monthly)" name="payProfile.grossSalary" value={v.payProfile.grossSalary} onChange={(x) => set({ payProfile: { ...v.payProfile, grossSalary: x } })} errors={errors} />
            <MoneyField label="Substantive pay" name="payProfile.substantivePay" value={v.payProfile.substantivePay} onChange={(x) => set({ payProfile: { ...v.payProfile, substantivePay: x } })} errors={errors} />
            <MoneyField label="Government loan deductions" name="payProfile.govtLoanDeductions" value={v.payProfile.govtLoanDeductions} onChange={(x) => set({ payProfile: { ...v.payProfile, govtLoanDeductions: x } })} errors={errors} />
          </FormSection>

          {!editing && <p className="text-caption text-fg-tertiary">Documents (photo, ID card, appointment order) are taken from the paper form. In the prototype they are recorded as received.</p>}
        </div>
        <div className="sticky bottom-4 z-10 flex max-w-5xl items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-3 shadow-dropdown">
          <span className="text-body text-fg-secondary">{editing ? 'Changes are logged with your name.' : 'Saving allots the next General No.'}</span>
          <div className="flex gap-2">
            <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={back} disabled={save.isPending} />
            <ButtonV2 text={editing ? 'Save changes' : 'Add member'} buttonType={ButtonV2Type.PRIMARY} onClick={submit} loading={save.isPending} />
          </div>
        </div>
      </ViewState>
    </>
  );
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
