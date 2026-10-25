// ST-21 New application on behalf of a member (office counter, from the signed paper form F2 / F3).
// Member search → snapshot → loan type → pay details (F2 items 4–5 or F3 items 5–9) → loan →
// sureties (F2 items 9–10) with a live eligibility panel from the server (same rules as the phone).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  SnackbarV2Variant,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatDisplayDate, formatINR } from '@tgs/domain';
import type { LoanApplicationForm, LoanProductCode, LoanRequestInput, MemberPick } from '@tgs/types';
import { FormSection, MoneyField, NumberField, TextField, fieldErrorsOf } from '@/components/Form';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { RuleCheckList } from '@/components/RuleCheckList';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formFor } from './loans';
import { MemberSearch, useDebounced } from '@/components/MemberSearch';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-caption text-fg-tertiary">{label}</p>
      <p className="text-label text-fg">{children}</p>
    </div>
  );
}

export function LoanFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [member, setMember] = useState<MemberPick | null>(null);
  const [product, setProduct] = useState<LoanProductCode>('ORDINARY');
  const [amount, setAmount] = useState(0);
  const [instalments, setInstalments] = useState(36);
  const [purpose, setPurpose] = useState('');
  const [form, setForm] = useState<LoanApplicationForm>({});
  const [sureties, setSureties] = useState<MemberPick[]>([]);
  const [pledged, setPledged] = useState('');
  /** ST-22: the running loan this application tops up (J-07). */
  const [topupOf, setTopupOf] = useState('');

  const ctx = useQuery({ queryKey: ['loan-context', member?.id], queryFn: () => api.loans.context(member!.id), enabled: Boolean(member) });
  const c = ctx.data;
  const prod = c?.products.find((p) => p.code === product);

  // When a member is chosen, start the pay sections from their DDO-certified pay profile.
  useEffect(() => {
    if (!c) return;
    setForm({
      pay: { scaleOfPay: c.pay.scaleOfPay, grossSalary: c.pay.grossSalary, govtLoanDeductions: c.pay.govtLoanDeductions, otherLoanDeductions: c.pay.otherLoanDeductions },
      salary: { substantivePay: c.pay.substantivePay, compulsoryDeductions: [{ label: 'G.P.F.', amount: 0 }], netPayEarnedToDate: 0 },
      security: { type: 'SURETY' },
    });
    setSureties([]);
    setPledged('');
    setTopupOf('');
  }, [c]);

  const input: LoanRequestInput = useMemo(
    () => ({
      product,
      amount: Number.isFinite(amount) ? amount : 0,
      instalments: Number.isFinite(instalments) ? instalments : 0,
      purpose,
      sureties: sureties.map((s) => s.id),
      ...(product === 'DEPOSIT' && pledged ? { pledgedDepositId: pledged } : {}),
      ...(topupOf ? { topupOf } : {}),
      form: {
        ...(product === 'SALARY' ? { salary: form.salary } : { pay: form.pay, security: product === 'DEPOSIT' ? { type: 'DEPOSIT_PLEDGE' as const } : form.security }),
        ...(product === 'EDUCATION' ? { education: form.education ?? { studentName: '', relation: 'Son', institution: '', course: '' } } : {}),
        ...(form.additionalShares ? { additionalShares: form.additionalShares } : {}),
      },
    }),
    [product, amount, instalments, purpose, sureties, pledged, topupOf, form],
  );
  const dInput = useDebounced(input, 400);
  const assess = useQuery({ queryKey: ['loan-assess', member?.id, dInput], queryFn: () => api.loans.assess({ ...dInput, memberId: member!.id }), enabled: Boolean(member && c && dInput.amount > 0 && dInput.instalments > 0), placeholderData: (p) => p });
  const a = assess.data;

  const submit = useMutation({
    mutationFn: () => api.loans.createOnBehalf(member!.id, input, true),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['loans'] });
      addSnackbarV2({ header: `Submitted ${d.loan.applicationNo}`, description: d.loan.status === 'SURETY_PENDING' ? 'Sureties have been asked to confirm in the app.' : 'Sent to the Accountant for review.', variant: SnackbarV2Variant.SUCCESS });
      navigate(`/loans/${d.loan.id}`);
    },
  });
  const errors = { ...(a?.fieldErrors ?? {}), ...fieldErrorsOf(submit.error) };
  const showErrors = submit.isError;
  const fe = showErrors ? errors : {};
  const blocked = a ? !a.eligible : true;

  const setPay = (p: Partial<NonNullable<LoanApplicationForm['pay']>>) => setForm((f) => ({ ...f, pay: { ...f.pay!, ...p } }));
  const setSalary = (p: Partial<NonNullable<LoanApplicationForm['salary']>>) => setForm((f) => ({ ...f, salary: { ...f.salary!, ...p } }));
  const setEdu = (p: Partial<NonNullable<LoanApplicationForm['education']>>) => setForm((f) => ({ ...f, education: { studentName: '', relation: 'Son', institution: '', course: '', ...f.education, ...p } }));

  return (
    <>
      <ButtonV2 text="Loans" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/loans')} />
      <div className="mt-3">
        <PageHeader title="New loan application" description="Enter a signed paper application (form F2 or F3) for a member. The same rules as the app check it live." />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5 pb-24 xl:col-span-2">
          <FormSection title="1 · Member" columns={1}>
            {!member ? (
              <MemberSearch placeholder="Search by name or General No." onPick={setMember} />
            ) : (
              <div className="flex flex-col gap-3 rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
                <div className="flex items-start justify-between gap-3">
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
                {c && (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Retires on">{formatDisplayDate(c.member.dor)}</Stat>
                    <Stat label="Left-over service">{c.member.leftoverLabel}</Stat>
                    <Stat label="Running loans">{c.activeProducts.length ? c.activeProducts.map((p) => c.products.find((x) => x.code === p)?.name ?? p).join(', ') : 'None'}</Stat>
                    <Stat label="Share deposit">{formatINR(c.shares.shareDepositBalance)}</Stat>
                  </div>
                )}
              </div>
            )}
          </FormSection>

          {member && c && (
            <>
              <FormSection title="2 · Loan type" columns={1}>
                <div role="radiogroup" aria-label="Loan type" className="grid gap-3 sm:grid-cols-2">
                  {c.products.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      role="radio"
                      aria-checked={product === p.code}
                      onClick={() => {
                        setProduct(p.code);
                        setInstalments(Math.min(instalments, p.maxInstalments));
                        setSureties([]);
                        setTopupOf('');
                      }}
                      className={cn('rounded-card border px-4 py-3 text-left transition-colors', product === p.code ? 'border-brand-solid bg-brand-subtle ring-1 ring-brand-border' : 'border-line hover:bg-surface-subtle')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-label text-fg">{p.name}</span>
                        <span className="text-label text-brand-text">{p.ratePercent}%</span>
                      </span>
                      <span className="mt-1 block text-caption text-fg-tertiary">
                        Up to {formatINR(p.maxAmount)} · {p.maxInstalments} months · form {formFor(p.code)}
                        {p.suretiesRequired ? ` · ${p.suretiesRequired} sureties` : ''}
                      </span>
                    </button>
                  ))}
                </div>
                {c.topupCandidates.some((t) => t.product === product) && (
                  <div className="flex flex-col gap-2 rounded-card border border-line px-4 py-3">
                    <p className="text-label text-fg">New loan or top-up? (ST-22)</p>
                    <div role="radiogroup" aria-label="New loan or top-up" className="flex flex-wrap gap-2">
                      {[{ id: '', label: 'New loan' }, ...c.topupCandidates.filter((t) => t.product === product).map((t) => ({ id: t.id, label: `Top-up of ${t.loanNo} (${formatINR(t.outstanding)} outstanding)` }))].map((o) => (
                        <button key={o.id || 'new'} type="button" role="radio" aria-checked={topupOf === o.id} onClick={() => setTopupOf(o.id)} className={cn('rounded-pill border px-3 py-1.5 text-label', topupOf === o.id ? 'border-brand-solid bg-brand-subtle text-brand-text' : 'border-line text-fg-secondary hover:bg-surface-subtle')}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-caption text-fg-tertiary">A top-up settles the running loan with interest to date (BR-007) and pays the balance after the share deposit (BR-004).</p>
                  </div>
                )}
              </FormSection>

              {product === 'SALARY' ? (
                <FormSection title="3 · Pay this month (form F3)" description="Net substantive pay = substantive pay − compulsory deductions − Ordinary-loan dues (BR-023).">
                  <MoneyField label="5 · Substantive pay" name="salary.substantivePay" value={form.salary?.substantivePay ?? 0} onChange={(v) => setSalary({ substantivePay: v })} errors={fe} />
                  <MoneyField label="9 · Net pay earned to date" name="salary.netPayEarnedToDate" value={form.salary?.netPayEarnedToDate ?? 0} onChange={(v) => setSalary({ netPayEarnedToDate: v })} errors={fe} hint="The loan cannot exceed this (D-058)" />
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <p className="text-label text-fg">6 · Compulsory deductions</p>
                    {(form.salary?.compulsoryDeductions ?? []).map((d, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                        <TextField label="Deduction" name={`ded-${i}`} value={d.label} onChange={(v) => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                        <MoneyField label="Amount" name={`ded-amt-${i}`} value={d.amount} onChange={(v) => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.map((x, j) => (j === i ? { ...x, amount: v } : x)) })} />
                        <ButtonV2 buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Trash2 size={16} /> }} aria-label="Remove deduction" onClick={() => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.filter((_, j) => j !== i) })} />
                      </div>
                    ))}
                    <div>
                      <ButtonV2 text="Add deduction" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Plus size={14} /> }} onClick={() => setSalary({ compulsoryDeductions: [...(form.salary?.compulsoryDeductions ?? []), { label: '', amount: 0 }] })} />
                    </div>
                    <p className="text-caption text-fg-tertiary">7 · Ordinary-loan dues this month: {formatINR(c.ordinaryLoanDues)} (from the society's records)</p>
                  </div>
                </FormSection>
              ) : (
                <FormSection title="3 · Pay details (form F2 items 4–5)" description="Pre-filled from the DDO-certified pay profile. The DDO certifies these again with the application.">
                  <TextField label="4b(i) · Scale of pay" name="pay.scaleOfPay" value={form.pay?.scaleOfPay ?? ''} onChange={(v) => setPay({ scaleOfPay: v })} />
                  <MoneyField label="5a · Gross salary per month" name="pay.grossSalary" value={form.pay?.grossSalary ?? 0} onChange={(v) => setPay({ grossSalary: v })} errors={fe} />
                  <MoneyField label="5b · Deductions for Govt loans" name="pay.govtLoanDeductions" value={form.pay?.govtLoanDeductions ?? 0} onChange={(v) => setPay({ govtLoanDeductions: v })} />
                  <MoneyField label="5c · Other loan deductions" name="pay.otherLoanDeductions" value={form.pay?.otherLoanDeductions ?? 0} onChange={(v) => setPay({ otherLoanDeductions: v })} />
                  <div className="rounded-control bg-surface-subtle px-4 py-3 sm:col-span-2">
                    <p className="text-caption text-fg-tertiary">5e · Net salary</p>
                    <p className="tabular text-label text-fg">{formatINR((form.pay?.grossSalary ?? 0) - (form.pay?.govtLoanDeductions ?? 0) - (form.pay?.otherLoanDeductions ?? 0))}</p>
                  </div>
                </FormSection>
              )}

              <FormSection title="4 · Loan">
                <div className="sm:col-span-2">
                  <MoneyField label="7a · Amount required" name="amount" value={amount} onChange={setAmount} errors={fe} hint={amount > 0 ? amountInWords(amount) : prod ? `Up to ${formatINR(prod.maxAmount)}` : undefined} />
                </div>
                <NumberField label="11 · Monthly instalments" name="instalments" value={instalments} onChange={setInstalments} errors={fe} unit="months" hint={a ? `At most ${a.preview.maxInstalments} for this member (BR-002 / BR-022)` : undefined} />
                <TextField label="7b · Purpose" name="purpose" value={purpose} onChange={setPurpose} errors={fe} placeholder="e.g. House repair" />
                {product === 'EDUCATION' && (
                  <>
                    <TextField label="Student name" name="education.studentName" value={form.education?.studentName ?? ''} onChange={(v) => setEdu({ studentName: v })} errors={fe} />
                    <TextField label="Relation" name="education.relation" value={form.education?.relation ?? 'Son'} onChange={(v) => setEdu({ relation: v })} />
                    <TextField label="Institution" name="education.institution" value={form.education?.institution ?? ''} onChange={(v) => setEdu({ institution: v })} errors={fe} />
                    <TextField label="Course" name="education.course" value={form.education?.course ?? ''} onChange={(v) => setEdu({ course: v })} errors={fe} />
                  </>
                )}
                {product === 'DEPOSIT' && (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <p className="text-label text-fg">8 · Fixed deposit to pledge</p>
                    {c.pledgeableDeposits.length ? (
                      c.pledgeableDeposits.map((d) => (
                        <label key={d.id} className={cn('flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2', pledged === d.id ? 'border-brand-solid bg-brand-subtle' : 'border-line')}>
                          <input type="radio" name="fd" checked={pledged === d.id} onChange={() => setPledged(d.id)} />
                          <span className="text-body text-fg">
                            {d.accountNo} · <Money value={d.principal} />
                            {d.maturityDate ? <span className="text-caption text-fg-tertiary"> · matures {formatDisplayDate(d.maturityDate)}</span> : null}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-caption text-fg-tertiary">This member has no fixed deposit free to pledge.</p>
                    )}
                    {fe.pledgedDepositId && <p className="text-caption text-danger-fg">{fe.pledgedDepositId}</p>}
                  </div>
                )}
              </FormSection>

              {prod && prod.suretiesRequired > 0 && (
                <FormSection title={`5 · Sureties (${sureties.length} of ${prod.suretiesRequired})`} description="Particulars and existing guarantees fill in automatically (F2 items 9–10). Each surety confirms in the app." columns={1}>
                  {(a?.sureties ?? []).filter((s) => sureties.some((x) => x.id === s.memberId)).map((s) => {
                    const issue = s.checks.find((x) => !x.pass);
                    return (
                      <div key={s.memberId} className="flex items-start justify-between gap-3 rounded-card border border-line px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-label text-fg">
                            {s.name} · No. {s.generalNo}
                          </p>
                          <p className="text-caption text-fg-secondary">
                            {s.designation} · {s.departmentName} · retires {formatDisplayDate(s.dor)} · surety on {s.guarantees.length} loan(s)
                          </p>
                          {issue && <p className={cn('mt-1 text-caption', issue.severity === 'block' ? 'text-danger-fg' : 'text-warning-fg')}>{issue.message}</p>}
                        </div>
                        <ButtonV2 buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <X size={14} /> }} aria-label={`Remove ${s.name}`} onClick={() => setSureties((x) => x.filter((y) => y.id !== s.memberId))} />
                      </div>
                    );
                  })}
                  {sureties.length < prod.suretiesRequired && <MemberSearch placeholder="Add a surety: name or General No." exclude={[member.id, ...sureties.map((s) => s.id)]} onPick={(m) => setSureties((x) => [...x, m])} />}
                  {fe.sureties && <p className="text-caption text-danger-fg">{fe.sureties}</p>}
                </FormSection>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <Panel title="Eligibility" subtitle="Checked live with the society's rules">
            {!member ? (
              <p className="text-body text-fg-secondary">Choose a member to start.</p>
            ) : !a ? (
              <p className="text-body text-fg-secondary">Enter the amount and instalments.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <RuleCheckList checks={a.checks} />
                {a.preview.topup && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-control bg-surface-subtle px-3 py-3">
                    <Stat label={`Settles ${a.preview.topup.loanNo}`}>
                      <Money value={a.preview.topup.outstandingPrincipal} />
                    </Stat>
                    <Stat label="Interest to date">
                      <Money value={a.preview.topup.accruedInterest} />
                    </Stat>
                  </dl>
                )}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-subtle pt-3">
                  <Stat label="First instalment">
                    <Money value={a.preview.emi} />
                  </Stat>
                  <Stat label="Total interest">
                    <Money value={a.preview.totalInterest} />
                  </Stat>
                  <Stat label="Share deposit deduction">
                    <Money value={a.preview.shareDeduction} />
                  </Stat>
                  <Stat label="Net disbursable">
                    <Money value={a.preview.netDisbursable} />
                  </Stat>
                </dl>
              </div>
            )}
          </Panel>
          {submit.isError && !Object.keys(fieldErrorsOf(submit.error)).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not submitted" description={isApiError(submit.error) ? submit.error.message : 'Try again.'} />}
          {submit.isError && Object.keys(errors).length > 0 && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Some details are missing" description={Object.values(errors).join(' · ')} />}
          <ButtonV2 text="Submit application" buttonType={ButtonV2Type.PRIMARY} width="100%" disabled={!member || blocked} loading={submit.isPending} onClick={() => submit.mutate()} />
          <p className="text-caption text-fg-tertiary">The member signed the paper form, so no OTP is needed. Ordinary and Education loans go to the sureties first; Salary and Deposit loans go straight to review.</p>
        </div>
      </div>
    </>
  );
}
