// MB-05 Apply for a loan (J-01, forms F2 / F3). Steps: type → pay → loan → sureties (F2 only) →
// review & sign with OTP. Saved as a draft on every step; eligibility comes live from the server,
// so the member sees exactly what the office will see (e.g. BR-002 for Ramaiah).
// MB-06 top-up = the same wizard with `?topup=<loanId>`: the old loan is settled from the new one (J-07).
// MB-09 "Take a loan against this FD" (D-045) = `?pledge=<depositId>`: a Deposit loan with that FD chosen.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, PenLine, Plus, Search, TriangleAlert, X } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatDisplayDate, formatINR, validateLoanRequest } from '@tgs/domain';
import type { LoanApplicationForm, LoanContext, LoanProductCode, LoanRequestInput, MemberPick } from '@tgs/types';
import { api } from '@/lib/api';
import { loanKeys, useAssessment, useLoanContext, useMemberSearch } from '@/lib/loans';
import { Alert, Button, Card, ChoiceCard, Divider, Header, KeyValue, NumberStepper, OtpInput, Screen, Section, Skeleton, Text, TextField, WizardProgress } from '@/ui';
import { color, radius, space } from '@/theme';

type StepKey = 'type' | 'pay' | 'loan' | 'sureties' | 'review';
const TITLES: Record<StepKey, string> = { type: 'Choose a loan', pay: 'About your pay', loan: 'Your loan', sureties: 'Your sureties', review: 'Review & sign' };
const STEP_FIELDS: Record<StepKey, (k: string) => boolean> = {
  type: () => false,
  pay: (k) => k.startsWith('pay.') || k.startsWith('salary.'),
  loan: (k) => ['amount', 'instalments', 'purpose', 'pledgedDepositId'].includes(k) || k.startsWith('education.'),
  sureties: (k) => k === 'sureties',
  review: () => false,
};

const rupees = (p: number) => (p > 0 ? String(Math.round(p / 100)) : '');
const paise = (t: string) => Math.round(Number(t.replace(/[^0-9]/g, '') || 0) * 100);

function startForm(ctx: LoanContext): LoanApplicationForm {
  return {
    pay: { scaleOfPay: ctx.pay.scaleOfPay, grossSalary: ctx.pay.grossSalary, govtLoanDeductions: ctx.pay.govtLoanDeductions, otherLoanDeductions: ctx.pay.otherLoanDeductions },
    salary: { substantivePay: ctx.pay.substantivePay, compulsoryDeductions: [{ label: 'G.P.F.', amount: 0 }], netPayEarnedToDate: 0 },
    security: { type: 'SURETY' },
  };
}

export default function ApplyLoan() {
  // product / amount (paise) / months come from MB-11 Calculators "Apply with these numbers".
  const params = useLocalSearchParams<{ draft?: string; topup?: string; pledge?: string; product?: string; amount?: string; months?: string }>();
  const qc = useQueryClient();
  const context = useLoanContext();
  const ctx = context.data;
  const [ready, setReady] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(params.draft);
  const [product, setProduct] = useState<LoanProductCode>('ORDINARY');
  const [amount, setAmount] = useState(0);
  const [instalments, setInstalments] = useState(24);
  const [purpose, setPurpose] = useState('');
  const [form, setForm] = useState<LoanApplicationForm>({});
  const [sureties, setSureties] = useState<Array<Pick<MemberPick, 'id' | 'name' | 'generalNo' | 'departmentName'>>>([]);
  const [pledged, setPledged] = useState<string>();
  const [topupOf, setTopupOf] = useState<string | undefined>(params.topup);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [signing, setSigning] = useState<{ otpRef: string; demoOtp?: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string>();
  const [q, setQ] = useState('');
  const search = useMemberSearch(q);

  // Start fresh from the pay profile, or resume a draft.
  useEffect(() => {
    if (!ctx || ready) return;
    if (!params.draft) {
      setForm(startForm(ctx));
      const parent = params.topup ? ctx.topupCandidates.find((t) => t.id === params.topup) : undefined;
      if (parent) {
        setProduct(parent.product);
        setStep(1);
      } else if (params.pledge && ctx.pledgeableDeposits.some((d) => d.id === params.pledge)) {
        setProduct('DEPOSIT');
        setPledged(params.pledge);
        setStep(1);
      } else if (params.product && ctx.products.some((p) => p.code === params.product)) {
        setProduct(params.product as LoanProductCode);
        if (Number(params.amount) > 0) setAmount(Number(params.amount));
        if (Number(params.months) > 0) setInstalments(Number(params.months));
        setStep(1);
      }
      setReady(true);
      return;
    }
    void api.myLoans.get(params.draft).then((d) => {
      const l = d.loan;
      setProduct(l.product);
      setAmount(l.appliedAmount);
      setInstalments(l.appliedInstalments || 24);
      setPurpose(l.purpose);
      setForm({ ...startForm(ctx), ...l.form });
      setSureties(d.sureties.map((s) => ({ id: s.memberId, name: s.name, generalNo: s.generalNo, departmentName: s.departmentName })));
      setPledged(l.pledgedDepositId);
      setTopupOf(l.parentLoanId);
      setStep(1);
      setReady(true);
    });
  }, [ctx, ready, params.draft]);

  const prod = ctx?.products.find((p) => p.code === product);
  const steps: StepKey[] = useMemo(() => ['type', 'pay', 'loan', ...(prod && prod.suretiesRequired > 0 ? (['sureties'] as const) : []), 'review'], [prod]);
  const key = steps[step] ?? 'type';

  const input: LoanRequestInput = useMemo(
    () => ({
      product,
      amount,
      instalments,
      purpose,
      sureties: prod?.suretiesRequired ? sureties.map((s) => s.id) : [],
      ...(product === 'DEPOSIT' && pledged ? { pledgedDepositId: pledged } : {}),
      ...(topupOf ? { topupOf } : {}),
      form:
        product === 'SALARY'
          ? { salary: form.salary }
          : { pay: form.pay, security: product === 'DEPOSIT' ? { type: 'DEPOSIT_PLEDGE' } : { type: 'SURETY' }, ...(product === 'EDUCATION' ? { education: form.education ?? { studentName: '', relation: '', institution: '', course: '' } } : {}) },
    }),
    [product, amount, instalments, purpose, sureties, pledged, topupOf, form, prod],
  );
  const assessment = useAssessment(input, Boolean(ctx && step >= 2), draftId);
  const a = assessment.data;
  const fieldErrors = ctx && prod ? validateLoanRequest(input, prod, ctx.member.id) : {};
  const stepErrors = Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => STEP_FIELDS[key](k)));
  const err = (k: string) => (showErrors ? stepErrors[k] : undefined);
  const blocks = (a?.checks ?? []).filter((c) => !c.pass && c.severity === 'block');

  if (!ctx || !ready) {
    return (
      <Screen header={<Header title="Apply for a loan" onBack={() => router.back()} />}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={300} radius={radius.card} />
      </Screen>
    );
  }

  const held = (code: LoanProductCode) => ctx.activeProducts.filter((p) => p === code).length;
  const setPay = (p: Partial<NonNullable<LoanApplicationForm['pay']>>) => setForm((f) => ({ ...f, pay: { ...f.pay!, ...p } }));
  const setSalary = (p: Partial<NonNullable<LoanApplicationForm['salary']>>) => setForm((f) => ({ ...f, salary: { ...f.salary!, ...p } }));
  const setEdu = (p: Partial<NonNullable<LoanApplicationForm['education']>>) => setForm((f) => ({ ...f, education: { studentName: '', relation: '', institution: '', course: '', ...f.education, ...p } }));

  const save = async () => {
    const d = draftId ? await api.myLoans.saveDraft(draftId, input) : await api.myLoans.createDraft(input);
    setDraftId(d.loan.id);
    void qc.invalidateQueries({ queryKey: loanKeys.mine });
  };

  const next = async () => {
    setServerError(null);
    if (Object.keys(stepErrors).length || (key === 'loan' && blocks.length)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await save();
      setShowErrors(false);
      setStep((s) => Math.min(s + 1, steps.length - 1));
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setServerError(isApiError(e) ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setShowErrors(false);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const startSigning = async () => {
    setServerError(null);
    setBusy(true);
    try {
      await save();
      const c = await api.myLoans.requestSign(draftId!);
      setSigning({ otpRef: c.otpRef, ...(c.demoOtp ? { demoOtp: c.demoOtp } : {}) });
    } catch (e) {
      setServerError(isApiError(e) ? e.message : 'Could not start signing.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!signing || !draftId) return;
    setBusy(true);
    setOtpError(undefined);
    try {
      const d = await api.myLoans.submit(draftId, signing.otpRef, otp);
      await qc.invalidateQueries({ queryKey: loanKeys.mine });
      router.replace({ pathname: '/loan/[id]', params: { id: d.loan.id } });
    } catch (e) {
      setOtpError(isApiError(e) ? (e.fieldErrors?.otp ?? e.message) : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  };

  const eligibility = a ? (
    <Card>
      <View style={{ gap: space[4] }}>
        <View style={styles.row}>
          {a.eligible ? <CircleCheck size={20} color={color.status.success.fg} /> : <CircleX size={20} color={color.status.danger.fg} />}
          <Text role="label" style={{ flex: 1 }}>
            {a.eligible ? 'You are eligible' : 'Not possible as entered'}
          </Text>
          {assessment.isFetching ? <ActivityIndicator size="small" color={color.text.tertiary} /> : null}
        </View>
        {a.checks
          .filter((c) => !c.pass)
          .map((c, i) => (
            <View key={i} style={styles.row}>
              {c.severity === 'block' ? <CircleX size={16} color={color.status.danger.fg} /> : <TriangleAlert size={16} color={color.status.warning.fg} />}
              <Text role="caption" tone={c.severity === 'block' ? 'danger' : 'warning'} style={{ flex: 1 }}>
                {c.message}
              </Text>
            </View>
          ))}
        {a.preview.topup ? (
          <>
            <Divider />
            <Text role="label">Your running loan {a.preview.topup.loanNo} is closed from this one</Text>
            <KeyValue label="Still owed" value={formatINR(a.preview.topup.outstandingPrincipal)} />
            <KeyValue label="Interest up to today" value={formatINR(a.preview.topup.accruedInterest)} />
          </>
        ) : null}
        <Divider />
        <KeyValue label="First instalment" value={formatINR(a.preview.emi)} emphasis />
        <KeyValue label="Share deposit deduction" value={formatINR(a.preview.shareDeduction)} />
        <KeyValue label="You receive" value={formatINR(a.preview.netDisbursable)} />
        <Text role="caption" tone="tertiary">
          Up to {a.preview.maxInstalments} months for you (left-over service {ctx.member.leftoverLabel}).
        </Text>
      </View>
    </Card>
  ) : null;

  return (
    <Screen
      header={<Header title={topupOf ? 'Top-up request' : 'Apply for a loan'} onBack={back} right={busy ? <ActivityIndicator size="small" color={color.text.tertiary} /> : null} />}
      footer={
        key === 'review' ? (
          signing ? (
            <Button text="Confirm & submit" size="lg" fullWidth disabled={otp.length !== 6} loading={busy} onPress={() => void confirm()} />
          ) : (
            <Button text="Sign with OTP" leftSlot={PenLine} size="lg" fullWidth loading={busy} onPress={() => void startSigning()} />
          )
        ) : (
          <Button text={key === 'type' ? 'Continue' : 'Save & continue'} size="lg" fullWidth loading={busy} onPress={() => void next()} />
        )
      }
    >
      <View style={{ gap: space[8] }}>
        <WizardProgress step={step + 1} total={steps.length} title={TITLES[key]} />
        <Text role="pageTitle">{TITLES[key]}</Text>
      </View>
      {showErrors && (Object.keys(stepErrors).length || blocks.length) ? <Alert type="error" heading={blocks.length && key === 'loan' ? 'This loan is not possible as entered' : 'A few details are missing'} description={key === 'loan' && blocks.length ? blocks[0]!.message : 'Fill the highlighted fields to continue.'} /> : null}
      {serverError ? <Alert type="error" heading="Something went wrong" description={serverError} /> : null}

      {key === 'type' && topupOf ? <Alert type="primary" heading="Top-up" description="Your new loan first pays off what you still owe on the running loan, with interest up to today. You receive the rest." /> : null}
      {key === 'type' &&
        ctx.products.map((p) => {
          const full = !topupOf && held(p.code) >= p.maxConcurrent;
          if (topupOf && p.code !== product) return null;
          return (
            <ChoiceCard
              key={p.code}
              title={`${p.name} · ${p.ratePercent}%`}
              description={full ? `You already have a running ${p.name}. Ask for a top-up instead.` : `Up to ${formatINR(p.maxAmount)} · ${p.maxInstalments} months${p.suretiesRequired ? ` · ${p.suretiesRequired} sureties` : p.code === 'DEPOSIT' ? ' · against your FD' : ' · no sureties'}`}
              selected={product === p.code}
              onPress={() => {
                if (full) return;
                setProduct(p.code);
                setInstalments(Math.min(instalments, p.maxInstalments));
                if (!p.suretiesRequired) setSureties([]);
              }}
            />
          );
        })}

      {key === 'pay' && product !== 'SALARY' && (
        <Card>
          <View style={{ gap: space[8] }}>
            <Text role="caption" tone="secondary">
              From your pay profile. Correct anything that changed; your DDO confirms these.
            </Text>
            <TextField label="Scale of pay" value={form.pay?.scaleOfPay ?? ''} onChangeText={(v) => setPay({ scaleOfPay: v })} />
            <TextField label="Gross salary per month" prefix="₹" keyboardType="number-pad" value={rupees(form.pay?.grossSalary ?? 0)} onChangeText={(v) => setPay({ grossSalary: paise(v) })} error={err('pay.grossSalary')} required />
            <TextField label="Deductions for Government loans" prefix="₹" keyboardType="number-pad" value={rupees(form.pay?.govtLoanDeductions ?? 0)} onChangeText={(v) => setPay({ govtLoanDeductions: paise(v) })} />
            <TextField label="Other loan deductions (not this society)" prefix="₹" keyboardType="number-pad" value={rupees(form.pay?.otherLoanDeductions ?? 0)} onChangeText={(v) => setPay({ otherLoanDeductions: paise(v) })} />
            <KeyValue label="Net salary" value={formatINR((form.pay?.grossSalary ?? 0) - (form.pay?.govtLoanDeductions ?? 0) - (form.pay?.otherLoanDeductions ?? 0))} emphasis />
          </View>
        </Card>
      )}

      {key === 'pay' && product === 'SALARY' && (
        <Card>
          <View style={{ gap: space[8] }}>
            <TextField label="Substantive pay" prefix="₹" keyboardType="number-pad" value={rupees(form.salary?.substantivePay ?? 0)} onChangeText={(v) => setSalary({ substantivePay: paise(v) })} error={err('salary.substantivePay')} required />
            <Text role="label">Compulsory deductions this month</Text>
            {(form.salary?.compulsoryDeductions ?? []).map((d, i) => (
              <View key={i} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <TextField label="Name" value={d.label} onChangeText={(v) => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Amount" prefix="₹" keyboardType="number-pad" value={rupees(d.amount)} onChangeText={(v) => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.map((x, j) => (j === i ? { ...x, amount: paise(v) } : x)) })} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove deduction" style={styles.icon} onPress={() => setSalary({ compulsoryDeductions: form.salary!.compulsoryDeductions.filter((_, j) => j !== i) })}>
                  <X size={18} color={color.text.tertiary} />
                </Pressable>
              </View>
            ))}
            {err('salary.compulsoryDeductions') ? (
              <Text role="caption" tone="danger">
                {err('salary.compulsoryDeductions')}
              </Text>
            ) : null}
            <Button text="Add a deduction" buttonType="secondary" size="sm" leftSlot={Plus} onPress={() => setSalary({ compulsoryDeductions: [...(form.salary?.compulsoryDeductions ?? []), { label: '', amount: 0 }] })} />
            <KeyValue label="Ordinary-loan dues (society)" value={formatINR(ctx.ordinaryLoanDues)} />
            <TextField label="Net pay earned so far this month" prefix="₹" keyboardType="number-pad" value={rupees(form.salary?.netPayEarnedToDate ?? 0)} onChangeText={(v) => setSalary({ netPayEarnedToDate: paise(v) })} error={err('salary.netPayEarnedToDate')} hint="A salary loan can be at most this." required />
          </View>
        </Card>
      )}

      {key === 'loan' && (
        <>
          <Card>
            <View style={{ gap: space[8] }}>
              <TextField label="Amount you need" prefix="₹" keyboardType="number-pad" value={rupees(amount)} onChangeText={(v) => setAmount(paise(v))} error={err('amount')} hint={amount > 0 ? amountInWords(amount) : prod ? `Up to ${formatINR(prod.maxAmount)}` : undefined} required />
              <View style={{ gap: space[3] }}>
                <Text role="label">Monthly instalments</Text>
                <NumberStepper value={instalments} min={1} max={prod?.maxInstalments ?? 100} step={instalments >= 12 ? 6 : 1} onChange={setInstalments} accessibilityLabel="Number of monthly instalments" />
              </View>
              <TextField label="What is it for?" value={purpose} onChangeText={setPurpose} placeholder="e.g. House repair, marriage, medical" error={err('purpose')} required />
              {product === 'EDUCATION' ? (
                <>
                  <TextField label="Student's name" value={form.education?.studentName ?? ''} onChangeText={(v) => setEdu({ studentName: v })} error={err('education.studentName')} required />
                  <TextField label="Relation to you" value={form.education?.relation ?? ''} onChangeText={(v) => setEdu({ relation: v })} placeholder="Son, Daughter, Self…" />
                  <TextField label="Institution" value={form.education?.institution ?? ''} onChangeText={(v) => setEdu({ institution: v })} error={err('education.institution')} required />
                  <TextField label="Course" value={form.education?.course ?? ''} onChangeText={(v) => setEdu({ course: v })} error={err('education.course')} required />
                </>
              ) : null}
            </View>
          </Card>
          {product === 'DEPOSIT' ? (
            <Section title="Fixed deposit to pledge">
              {ctx.pledgeableDeposits.length ? (
                ctx.pledgeableDeposits.map((d) => <ChoiceCard key={d.id} title={`${d.accountNo} · ${formatINR(d.principal)}`} description={d.maturityDate ? `Matures ${formatDisplayDate(d.maturityDate)}` : undefined} selected={pledged === d.id} onPress={() => setPledged(d.id)} />)
              ) : (
                <Alert type="warning" heading="No fixed deposit to pledge" description="You need an active FD that is not already pledged." />
              )}
              {err('pledgedDepositId') ? (
                <Text role="caption" tone="danger">
                  {err('pledgedDepositId')}
                </Text>
              ) : null}
            </Section>
          ) : null}
          {eligibility}
        </>
      )}

      {key === 'sureties' && prod && (
        <>
          <Text role="body" tone="secondary">
            Choose {prod.suretiesRequired} members who know you. Each one gets a request in their app and signs with an OTP.
          </Text>
          {sureties.map((s) => {
            const card = a?.sureties.find((x) => x.memberId === s.id);
            const issue = card?.checks.find((c) => !c.pass);
            return (
              <Card key={s.id}>
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text role="label">{s.name}</Text>
                    <Text role="caption" tone="tertiary">
                      No. {s.generalNo} · {s.departmentName}
                    </Text>
                    {issue ? (
                      <Text role="caption" tone={issue.severity === 'block' ? 'danger' : 'warning'}>
                        {issue.message}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.name}`} style={styles.icon} onPress={() => setSureties((x) => x.filter((y) => y.id !== s.id))}>
                    <X size={20} color={color.text.tertiary} />
                  </Pressable>
                </View>
              </Card>
            );
          })}
          {sureties.length < prod.suretiesRequired ? (
            <Card>
              <View style={{ gap: space[6] }}>
                <TextField label="Find a member" value={q} onChangeText={setQ} placeholder="Name or General No." />
                {search.isFetching ? <ActivityIndicator size="small" color={color.text.tertiary} /> : null}
                {(search.data ?? [])
                  .filter((m) => !sureties.some((s) => s.id === m.id))
                  .slice(0, 6)
                  .map((m) => (
                    <Pressable
                      key={m.id}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.result, pressed && { backgroundColor: color.bg.surfaceSubtle }]}
                      onPress={() => {
                        setSureties((x) => [...x, m]);
                        setQ('');
                      }}
                    >
                      <Search size={16} color={color.text.tertiary} />
                      <View style={{ flex: 1 }}>
                        <Text role="label">{m.name}</Text>
                        <Text role="caption" tone="tertiary">
                          No. {m.generalNo} · {m.departmentName} · {m.leftoverLabel} left
                        </Text>
                      </View>
                    </Pressable>
                  ))}
              </View>
            </Card>
          ) : null}
          {err('sureties') ? <Alert type="error" heading={err('sureties')!} /> : null}
          {blocks.some((b) => b.ruleId === 'BR-014') ? <Alert type="error" heading="Choose another surety" description={blocks.find((b) => b.ruleId === 'BR-014')!.message} /> : null}
        </>
      )}

      {key === 'review' && prod && (
        <>
          <Card>
            <KeyValue label="Loan" value={`${prod.name} · ${prod.ratePercent}%`} />
            <KeyValue label="Amount" value={formatINR(amount)} emphasis />
            <KeyValue label="Instalments" value={`${instalments} months`} />
            <KeyValue label="Purpose" value={purpose} />
            {a ? <KeyValue label="First instalment" value={formatINR(a.preview.emi)} /> : null}
            {a ? <KeyValue label="You receive" value={formatINR(a.preview.netDisbursable)} /> : null}
            {sureties.length ? <KeyValue label="Sureties" value={sureties.map((s) => s.name).join(', ')} /> : null}
          </Card>
          {a && !a.eligible ? <Alert type="error" heading="Not possible as entered" description={blocks[0]?.message} /> : null}
          <Section title="Declaration">
            <Card>
              <Text role="body">{product === 'SALARY' ? ctx.declaration.f3 : ctx.declaration.f2}</Text>
              <Text role="caption" tone="tertiary">
                Text version {ctx.declaration.version}
              </Text>
            </Card>
          </Section>
          {signing ? (
            <Card>
              <View style={{ gap: space[6] }}>
                <Text role="body">Enter the 6-digit code we sent to your mobile to sign.</Text>
                {signing.demoOtp ? (
                  <Text role="caption" tone="tertiary">
                    Demo code: {signing.demoOtp}
                  </Text>
                ) : null}
                <OtpInput value={otp} onChange={setOtp} error={otpError} />
              </View>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  result: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[4], borderRadius: radius.control },
});
