// ST-21m / ST-22m New application on behalf of a member (from the signed paper form F2 / F3), one topic per step.
// The server checks eligibility live, with the same rules as the app.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Trash2, X } from 'lucide-react-native';
import { amountInWords, formatDisplayDate, formatINR } from '@tgs/domain';
import type { LoanApplicationForm, LoanDetail, LoanProductCode, LoanRequestInput, MemberPick } from '@tgs/types';
import { ActionAlert, MemberPicker, MoneyField, RuleChecks, useAction, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { formFor } from '@/lib/staffLoans';
import { Button, Card, ChoiceCard, Divider, Header, KeyValue, Screen, Section, Skeleton, Text, TextField, WizardProgress } from '@/ui';
import { space } from '@/theme';

export default function NewLoan() {
  const [member, setMember] = useState<MemberPick>();
  const [product, setProduct] = useState<LoanProductCode>('ORDINARY');
  const [amount, setAmount] = useState(Number.NaN);
  const [instalments, setInstalments] = useState(36);
  const [purpose, setPurpose] = useState('');
  const [form, setForm] = useState<LoanApplicationForm>({});
  const [sureties, setSureties] = useState<MemberPick[]>([]);
  const [pledged, setPledged] = useState('');
  const [topupOf, setTopupOf] = useState('');
  const [step, setStep] = useState(0);
  const a = useAction();

  const ctx = useQuery({ queryKey: ['loan-context', member?.id], queryFn: () => api.loans.context(member!.id), enabled: !!member });
  const c = ctx.data;
  const prod = c?.products.find((p) => p.code === product);

  // Start the pay sections from the member's DDO-certified pay profile.
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
  const dInput = useDebounced(input);
  const assess = useQuery({ queryKey: ['loan-assess', member?.id, dInput], queryFn: () => api.loans.assess({ ...dInput, memberId: member!.id }), enabled: !!(member && c && dInput.amount > 0 && dInput.instalments > 0), placeholderData: (p) => p });
  const res = assess.data;
  const fe = { ...(a.error ? (res?.fieldErrors ?? {}) : {}), ...a.fields };
  const steps = ['Member', 'Loan type', 'Pay details', 'Loan', ...(prod?.suretiesRequired ? ['Sureties'] : []), 'Check and submit'];
  const name = steps[step]!;
  const isLast = step === steps.length - 1;

  const setPay = (p: Partial<NonNullable<LoanApplicationForm['pay']>>) => setForm((f) => ({ ...f, pay: { ...f.pay!, ...p } }));
  const setSalary = (p: Partial<NonNullable<LoanApplicationForm['salary']>>) => setForm((f) => ({ ...f, salary: { ...f.salary!, ...p } }));
  const setEdu = (p: Partial<NonNullable<LoanApplicationForm['education']>>) => setForm((f) => ({ ...f, education: { studentName: '', relation: 'Son', institution: '', course: '', ...f.education, ...p } }));

  const submit = async () => {
    let saved: LoanDetail | undefined;
    const ok = await a.run(async () => {
      saved = await api.loans.createOnBehalf(member!.id, input, true);
    });
    if (ok && saved) router.replace(`/staff/loan/${saved.loan.id}`);
  };

  const ded = form.salary?.compulsoryDeductions ?? [];
  const setDed = (next: typeof ded) => setSalary({ compulsoryDeductions: next });

  return (
    <Screen
      header={<Header title="New loan application" onBack={() => (step ? setStep(step - 1) : router.back())} />}
      footer={isLast ? <Button text="Submit application" size="lg" fullWidth loading={a.busy} disabled={!res?.eligible || a.busy || a.unconfirmed} onPress={() => void submit()} /> : <Button text="Continue" size="lg" fullWidth disabled={!member || !c} onPress={() => setStep(step + 1)} />}
    >
      <WizardProgress step={step + 1} total={steps.length} title={name} />

      {name === 'Member' ? (
        <>
          <Text role="body" tone="secondary">
            Enter a signed paper application (form F2 or F3) for a member.
          </Text>
          <MemberPicker value={member} onPick={setMember} error={fe.memberId} />
          {member && !c ? <Skeleton height={140} /> : null}
          {c ? (
            <Card>
              <KeyValue label="Retires on" value={formatDisplayDate(c.member.dor)} />
              <KeyValue label="Left-over service" value={c.member.leftoverLabel} />
              <KeyValue label="Running loans" value={c.activeProducts.length ? c.activeProducts.map((p) => c.products.find((x) => x.code === p)?.name ?? p).join(', ') : 'None'} />
              <KeyValue label="Share deposit" value={formatINR(c.shares.shareDepositBalance)} />
            </Card>
          ) : null}
        </>
      ) : null}

      {name === 'Loan type' && c ? (
        <View style={{ gap: space[4] }}>
          {c.products.map((p) => (
            <ChoiceCard
              key={p.code}
              title={`${p.name} · ${p.ratePercent}%`}
              description={`Up to ${formatINR(p.maxAmount)} · ${p.maxInstalments} months · form ${formFor(p.code)}${p.suretiesRequired ? ` · ${p.suretiesRequired} sureties` : ''}`}
              selected={product === p.code}
              onPress={() => {
                setProduct(p.code);
                setInstalments(Math.min(instalments, p.maxInstalments));
                setSureties([]);
                setTopupOf('');
              }}
            />
          ))}
          {c.topupCandidates.some((t) => t.product === product) ? (
            <Section title="New loan or top-up?" description="A top-up settles the running loan with interest to date (BR-007) and pays the balance after the share deposit (BR-004).">
              <View style={{ gap: space[4] }}>
                {[{ id: '', label: 'New loan' }, ...c.topupCandidates.filter((t) => t.product === product).map((t) => ({ id: t.id, label: `Top-up of ${t.loanNo} (${formatINR(t.outstanding)} outstanding)` }))].map((o) => (
                  <ChoiceCard key={o.id || 'new'} title={o.label} selected={topupOf === o.id} onPress={() => setTopupOf(o.id)} />
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      ) : null}

      {name === 'Pay details' && c ? (
        product === 'SALARY' ? (
          <View style={{ gap: space[8] }}>
            <Text role="body" tone="secondary">
              Net substantive pay = substantive pay − compulsory deductions − Ordinary-loan dues (BR-023).
            </Text>
            <MoneyField label="5 · Substantive pay" value={form.salary?.substantivePay ?? 0} onChange={(v) => setSalary({ substantivePay: v })} error={fe['form.salary.substantivePay'] ?? fe['salary.substantivePay']} />
            <MoneyField label="9 · Net pay earned to date" value={form.salary?.netPayEarnedToDate ?? 0} onChange={(v) => setSalary({ netPayEarnedToDate: v })} error={fe['form.salary.netPayEarnedToDate'] ?? fe['salary.netPayEarnedToDate']} hint="The loan cannot exceed this (D-058)" />
            <Section title="6 · Compulsory deductions">
              <View style={{ gap: space[4] }}>
                {ded.map((d, i) => (
                  <Card key={i}>
                    <View style={{ gap: space[4] }}>
                      <TextField label="Deduction" value={d.label} onChangeText={(v) => setDed(ded.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
                      <MoneyField label="Amount" value={d.amount} onChange={(v) => setDed(ded.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                      <Button text="Remove" subType="inline" buttonType="danger" leftSlot={Trash2} style={{ alignSelf: 'flex-start' }} onPress={() => setDed(ded.filter((_, j) => j !== i))} />
                    </View>
                  </Card>
                ))}
                <Button text="Add deduction" buttonType="secondary" fullWidth onPress={() => setDed([...ded, { label: '', amount: 0 }])} />
              </View>
              <Text role="caption" tone="tertiary">
                7 · Ordinary-loan dues this month: {formatINR(c.ordinaryLoanDues)} (from the society's records)
              </Text>
            </Section>
          </View>
        ) : (
          <View style={{ gap: space[8] }}>
            <Text role="body" tone="secondary">
              Pre-filled from the DDO-certified pay profile. The DDO certifies these again with the application.
            </Text>
            <TextField label="4b(i) · Scale of pay" value={form.pay?.scaleOfPay ?? ''} onChangeText={(v) => setPay({ scaleOfPay: v })} />
            <MoneyField label="5a · Gross salary per month" value={form.pay?.grossSalary ?? 0} onChange={(v) => setPay({ grossSalary: v })} error={fe['form.pay.grossSalary'] ?? fe['pay.grossSalary']} />
            <MoneyField label="5b · Deductions for Govt loans" value={form.pay?.govtLoanDeductions ?? 0} onChange={(v) => setPay({ govtLoanDeductions: v })} />
            <MoneyField label="5c · Other loan deductions" value={form.pay?.otherLoanDeductions ?? 0} onChange={(v) => setPay({ otherLoanDeductions: v })} />
            <Card>
              <KeyValue label="5e · Net salary" value={formatINR((form.pay?.grossSalary ?? 0) - (form.pay?.govtLoanDeductions ?? 0) - (form.pay?.otherLoanDeductions ?? 0))} emphasis />
            </Card>
          </View>
        )
      ) : null}

      {name === 'Loan' && c ? (
        <View style={{ gap: space[8] }}>
          <MoneyField label="7a · Amount required" required value={amount} onChange={setAmount} error={fe.amount} hint={amount > 0 ? amountInWords(amount) : prod ? `Up to ${formatINR(prod.maxAmount)}` : undefined} />
          <TextField label="11 · Monthly instalments" required keyboardType="number-pad" suffix={<Text role="caption" tone="tertiary">months</Text>} value={Number.isFinite(instalments) ? String(instalments) : ''} onChangeText={(t) => setInstalments(t === '' ? Number.NaN : Number(t.replace(/\D/g, '')))} error={fe.instalments} hint={res ? `At most ${res.preview.maxInstalments} for this member (BR-002 / BR-022)` : undefined} />
          <TextField label="7b · Purpose" required value={purpose} onChangeText={setPurpose} placeholder="e.g. House repair" error={fe.purpose} />
          {product === 'EDUCATION' ? (
            <>
              <TextField label="Student name" value={form.education?.studentName ?? ''} onChangeText={(v) => setEdu({ studentName: v })} error={fe['form.education.studentName'] ?? fe['education.studentName']} />
              <TextField label="Relation" value={form.education?.relation ?? 'Son'} onChangeText={(v) => setEdu({ relation: v })} />
              <TextField label="Institution" value={form.education?.institution ?? ''} onChangeText={(v) => setEdu({ institution: v })} error={fe['form.education.institution'] ?? fe['education.institution']} />
              <TextField label="Course" value={form.education?.course ?? ''} onChangeText={(v) => setEdu({ course: v })} error={fe['form.education.course'] ?? fe['education.course']} />
            </>
          ) : null}
          {product === 'DEPOSIT' ? (
            <Section title="8 · Fixed deposit to pledge">
              <View style={{ gap: space[4] }}>
                {c.pledgeableDeposits.length ? (
                  c.pledgeableDeposits.map((d) => <ChoiceCard key={d.id} title={`${d.accountNo} · ${formatINR(d.principal)}`} {...(d.maturityDate ? { description: `Matures ${formatDisplayDate(d.maturityDate)}` } : {})} selected={pledged === d.id} onPress={() => setPledged(d.id)} />)
                ) : (
                  <Text role="caption" tone="tertiary">
                    This member has no fixed deposit free to pledge.
                  </Text>
                )}
              </View>
              {fe.pledgedDepositId ? (
                <Text role="caption" tone="danger">
                  {fe.pledgedDepositId}
                </Text>
              ) : null}
            </Section>
          ) : null}
        </View>
      ) : null}

      {name === 'Sureties' && member && prod ? (
        <View style={{ gap: space[4] }}>
          <Text role="body" tone="secondary">
            {sureties.length} of {prod.suretiesRequired} chosen. Each surety confirms in the app.
          </Text>
          {sureties.map((m) => {
            const s = res?.sureties.find((x) => x.memberId === m.id);
            const issue = s?.checks.find((x) => !x.pass);
            return (
              <Card key={m.id}>
                <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text role="label">
                      {m.name} · No. {m.generalNo}
                    </Text>
                    <Text role="caption" tone="secondary">
                      {m.designation} · {m.departmentName}
                      {s ? ` · retires ${formatDisplayDate(s.dor)} · surety on ${s.guarantees.length} loan(s)` : ''}
                    </Text>
                    {issue ? (
                      <Text role="caption" tone={issue.severity === 'block' ? 'danger' : 'warning'}>
                        {issue.message}
                      </Text>
                    ) : null}
                  </View>
                  <Button subType="iconOnly" buttonType="secondary" size="sm" leftSlot={X} accessibilityLabel={`Remove ${m.name}`} onPress={() => setSureties((x) => x.filter((y) => y.id !== m.id))} />
                </View>
              </Card>
            );
          })}
          {sureties.length < prod.suretiesRequired ? <MemberPicker key={sureties.length} label="Add a surety" exclude={[member.id, ...sureties.map((s) => s.id)]} onPick={(m) => m && setSureties((x) => [...x, m])} /> : null}
          {fe.sureties ? (
            <Text role="caption" tone="danger">
              {fe.sureties}
            </Text>
          ) : null}
        </View>
      ) : null}

      {isLast ? (
        !res ? (
          <Text role="body" tone="secondary">
            Enter the amount and instalments first.
          </Text>
        ) : (
          <>
            <Section title="Eligibility" description="Checked live with the society's rules">
              <RuleChecks checks={res.checks} />
            </Section>
            <Card>
              {res.preview.topup ? (
                <>
                  <KeyValue label={`Settles ${res.preview.topup.loanNo}`} value={formatINR(res.preview.topup.outstandingPrincipal)} />
                  <KeyValue label="Interest to date" value={formatINR(res.preview.topup.accruedInterest)} />
                  <Divider />
                </>
              ) : null}
              <KeyValue label="First instalment" value={formatINR(res.preview.emi)} />
              <KeyValue label="Total interest" value={formatINR(res.preview.totalInterest)} />
              <KeyValue label="Share deposit deduction" value={formatINR(res.preview.shareDeduction)} />
              <KeyValue label="Net disbursable" value={formatINR(res.preview.netDisbursable)} emphasis />
            </Card>
            <Text role="caption" tone="tertiary">
              The member signed the paper form, so no OTP is needed. Ordinary and Education loans go to the sureties first; Salary and Deposit loans go straight to review.
            </Text>
            <ActionAlert action={a} heading="Not submitted" check={{ text: 'Check Loans', href: '/staff/loans' }} />
          </>
        )
      ) : null}
    </Screen>
  );
}
