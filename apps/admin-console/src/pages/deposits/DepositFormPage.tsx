// ST-31 Open an FD at the counter (form F4 layout): member → amount (+ words) → period with the slab
// rate → interest payout → holders (single / joint / minor) → nominee → the four rules → save as a
// request; the Cashier then records the payment on the detail page (ST-33).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SnackbarV2Variant, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, calculateFdMaturity, fdRateFor, formatDisplayDate, formatINR, validateFdRequest } from '@tgs/domain';
import type { FdHolder, FdRequestInput, MemberPick } from '@tgs/types';
import { FormSection, MoneyField, NumberField, TextField, fieldErrorsOf } from '@/components/Form';
import { MemberSearch } from '@/components/MemberSearch';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAYOUTS = [
  { value: 'ON_MATURITY', label: 'On maturity' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'MONTHLY', label: 'Monthly' },
] as const;
const blankHolder: FdHolder = { name: '', fatherOrHusbandName: '', occupation: '', address: '', phone: '' };

function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn('rounded-pill border px-3 py-1.5 text-label', value === o.value ? 'border-brand-solid bg-brand-subtle text-brand-text' : 'border-line text-fg-secondary hover:bg-surface-subtle')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DepositFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const demo = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const [member, setMember] = useState<MemberPick | null>(null);
  const profile = useQuery({ queryKey: ['member', member?.id], queryFn: () => api.members.get(member!.id), enabled: Boolean(member) });
  const [v, setV] = useState<FdRequestInput>({ principal: 0, tenureMonths: 24, payoutFrequency: 'ON_MATURITY', holding: 'SINGLE', nominee: { name: '', relation: 'Spouse' } });
  const [showErrors, setShowErrors] = useState(false);
  const set = (p: Partial<FdRequestInput>) => setV((x) => ({ ...x, ...p }));

  // Nominee defaults from the member master (F4 item 9).
  useEffect(() => {
    const n = profile.data?.member.nominee;
    if (n) setV((x) => ({ ...x, nominee: { name: n.name, relation: n.relation } }));
  }, [profile.data]);

  const s = settings.data?.settings;
  const today = demo.data?.today ?? '';
  const rate = s ? fdRateFor(v.tenureMonths, s.fdSlabs) : undefined;
  const local = s && today ? validateFdRequest(v, { slabs: s.fdSlabs, minAmount: s.fdMinAmount, today }) : {};
  const mat = useMemo(() => (rate && v.principal > 0 && today ? calculateFdMaturity({ principal: v.principal, ratePercent: rate, tenureMonths: v.tenureMonths, payout: v.payoutFrequency, openedOn: today }) : undefined), [rate, v.principal, v.tenureMonths, v.payoutFrequency, today]);

  const save = useMutation({
    mutationFn: () => api.deposits.open(member!.id, v),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['deposits'] });
      addSnackbarV2({ header: `Request ${d.deposit.accountNo} saved`, description: 'Record the payment to send it for acceptance.', variant: SnackbarV2Variant.SUCCESS });
      navigate(`/deposits/${d.deposit.id}`);
    },
  });
  const errors = showErrors ? { ...local, ...fieldErrorsOf(save.error) } : {};
  const holders = v.holders ?? [];
  const setHolder = (i: number, p: Partial<FdHolder>) => set({ holders: holders.map((h, j) => (j === i ? { ...h, ...p } : h)) });

  return (
    <>
      <ButtonV2 text="Deposits" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/deposits')} />
      <div className="mt-3">
        <PageHeader title="Open a fixed deposit" description="Enter the signed form F4. After saving, record the payment (cash with denominations, or transfer); the Secretary and President then accept it." />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 pb-24 xl:col-span-2">
          <FormSection title="1–4 · Depositor" columns={1}>
            {!member ? (
              <MemberSearch placeholder="Search the member by name or General No." onPick={setMember} />
            ) : (
              <div className="flex items-start justify-between gap-3 rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
                <div>
                  <p className="text-label text-fg">
                    {member.name} · No. {member.generalNo}
                  </p>
                  <p className="text-caption text-fg-secondary">
                    {member.designation} · {member.departmentName}
                  </p>
                </div>
                <ButtonV2 text="Change" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <X size={14} /> }} onClick={() => setMember(null)} />
              </div>
            )}
          </FormSection>

          {member && (
            <>
              <FormSection title="5–8 · Deposit">
                <div className="sm:col-span-2">
                  <MoneyField label="5 · Amount of deposit" name="principal" value={v.principal} onChange={(principal) => set({ principal })} errors={errors} hint={v.principal > 0 ? amountInWords(v.principal) : s ? `At least ${formatINR(s.fdMinAmount)}` : undefined} />
                </div>
                <NumberField label="6 · Period" name="tenureMonths" value={v.tenureMonths} onChange={(tenureMonths) => set({ tenureMonths })} errors={errors} unit="months" hint={s ? s.fdSlabs.map((x) => `${x.fromMonths}–${x.toMonths}: ${x.ratePercent}%`).join(' · ') : undefined} />
                <div className="rounded-control bg-surface-subtle px-4 py-3">
                  <p className="text-caption text-fg-tertiary">7 · Rate of interest (from the slab)</p>
                  <p className="text-label text-fg">{rate ? `${rate}% a year` : 'No slab for this period'}</p>
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <p className="text-label text-fg">8 · Interest payable</p>
                  <Chips label="Interest payable" value={v.payoutFrequency} options={PAYOUTS} onChange={(payoutFrequency) => set({ payoutFrequency })} />
                </div>
              </FormSection>

              <FormSection title="Holders" columns={1}>
                <Chips
                  label="Holding"
                  value={v.holding}
                  options={[
                    { value: 'SINGLE', label: 'Only the member' },
                    { value: 'JOINT', label: 'Joint' },
                    { value: 'MINOR', label: 'For a minor' },
                  ]}
                  onChange={(holding) => set({ holding, ...(holding === 'JOINT' && !holders.length ? { holders: [{ ...blankHolder }] } : {}), ...(holding === 'MINOR' && !v.minor ? { minor: { name: '', dob: '', guardianRelation: 'Father' } } : {}) })}
                />
                {v.holding === 'JOINT' && (
                  <div className="flex flex-col gap-4">
                    {holders.map((h, i) => (
                      <div key={i} className="grid gap-3 rounded-card border border-line p-4 sm:grid-cols-2">
                        <TextField label="Name" name={`holders.${i}.name`} value={h.name} onChange={(name) => setHolder(i, { name })} errors={errors} />
                        <TextField label="Father's / husband's name" name={`holders.${i}.fatherOrHusbandName`} value={h.fatherOrHusbandName} onChange={(fatherOrHusbandName) => setHolder(i, { fatherOrHusbandName })} errors={errors} />
                        <TextField label="Occupation" name={`holders.${i}.occupation`} value={h.occupation} onChange={(occupation) => setHolder(i, { occupation })} />
                        <TextField label="Phone" name={`holders.${i}.phone`} value={h.phone} onChange={(phone) => setHolder(i, { phone: phone.replace(/\D/g, '').slice(0, 10) })} errors={errors} />
                        <div className="sm:col-span-2">
                          <TextField label="Address" name={`holders.${i}.address`} value={h.address} onChange={(address) => setHolder(i, { address })} errors={errors} />
                        </div>
                        {holders.length > 1 && (
                          <div>
                            <ButtonV2 text="Remove" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Trash2 size={14} /> }} onClick={() => set({ holders: holders.filter((_, j) => j !== i) })} />
                          </div>
                        )}
                      </div>
                    ))}
                    {holders.length < 2 && (
                      <div>
                        <ButtonV2 text="Add another holder" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Plus size={14} /> }} onClick={() => set({ holders: [...holders, { ...blankHolder }] })} />
                      </div>
                    )}
                    <p className="text-caption text-fg-tertiary">{holders.length + 1} holders: payment to {holders.length === 1 ? 'either or the survivor' : 'any one or the survivors'} (rules 3–4).</p>
                    {errors.holders && <p className="text-caption text-danger-fg">{errors.holders}</p>}
                  </div>
                )}
                {v.holding === 'MINOR' && v.minor && (
                  <div className="grid gap-3 rounded-card border border-line p-4 sm:grid-cols-3">
                    <TextField label="Minor's name" name="minor.name" value={v.minor.name} onChange={(name) => set({ minor: { ...v.minor!, name } })} errors={errors} />
                    <TextInputV2 label="Date of birth" type="date" value={v.minor.dob} onChange={(e) => set({ minor: { ...v.minor!, dob: e.target.value } })} error={errors['minor.dob'] ? { show: true, message: errors['minor.dob'] } : undefined} />
                    <TextField label="Member is the minor's" name="minor.guardianRelation" value={v.minor.guardianRelation} onChange={(guardianRelation) => set({ minor: { ...v.minor!, guardianRelation } })} errors={errors} placeholder="Father / Mother" />
                  </div>
                )}
              </FormSection>

              <FormSection title="9 · Nominee">
                <TextField label="Nominee name" name="nominee.name" value={v.nominee.name} onChange={(name) => set({ nominee: { ...v.nominee, name } })} errors={errors} />
                <TextField label="Relationship" name="nominee.relation" value={v.nominee.relation} onChange={(relation) => set({ nominee: { ...v.nominee, relation: relation as FdRequestInput['nominee']['relation'] } })} errors={errors} />
              </FormSection>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <Panel title="Maturity" subtitle="Quarterly compounding placeholder (Q-313)">
            {mat ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt className="text-caption text-fg-tertiary">Matures on</dt>
                  <dd className="text-label text-fg">{formatDisplayDate(mat.maturityDate)}</dd>
                </div>
                <div>
                  <dt className="text-caption text-fg-tertiary">Maturity value</dt>
                  <dd className="text-label text-fg">
                    <Money value={mat.maturityValue} />
                  </dd>
                </div>
                {mat.periodicInterest > 0 && (
                  <div className="col-span-2">
                    <dt className="text-caption text-fg-tertiary">Interest each period</dt>
                    <dd className="text-label text-fg">
                      <Money value={mat.periodicInterest} />
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-body text-fg-secondary">Choose the member, amount and period.</p>
            )}
          </Panel>
          {save.isError && !Object.keys(fieldErrorsOf(save.error)).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}
          {showErrors && Object.keys(errors).length > 0 && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Some details need attention" description={Object.values(errors).join(' · ')} />}
          <ButtonV2
            text="Save request"
            width="100%"
            disabled={!member}
            loading={save.isPending}
            onClick={() => {
              setShowErrors(true);
              if (!Object.keys(local).length) save.mutate();
            }}
          />
          <p className="text-caption text-fg-tertiary">The member signed the paper F4, so no OTP is needed. The FDR is issued when the President accepts.</p>
        </div>
      </div>
    </>
  );
}
