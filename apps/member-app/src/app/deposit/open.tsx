// MB-15 Open an FD request (J-16, form F4): amount & period (slab rate, BR-017) → interest payout →
// holders (single / joint / minor) → nominee → the four rules → Sign with OTP. Every step is checked
// with the same rule the API uses (validateFdRequest); the money is paid at the counter or by transfer.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Baby, PenLine, Plus, Trash2, User, Users } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { amountInWords, calculateFdMaturity, fdRateFor, formatDisplayDate, formatINR, validateFdRequest } from '@tgs/domain';
import type { FdHolder, FdRequestInput, Nominee } from '@tgs/types';
import { api } from '@/lib/api';
import { PAYOUT_LABEL, depositKeys, useDepositContext } from '@/lib/deposits';
import { Banner, Button, Card, CheckboxInput, SelectableCard, DateField, Divider, Header, MetadataListItem, OtpInput, Screen, Section, SelectField, Skeleton, StepHeader, Text, TextField, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

type StepKey = 'amount' | 'payout' | 'holders' | 'nominee' | 'review';
const STEPS: StepKey[] = ['amount', 'payout', 'holders', 'nominee', 'review'];
const TITLES: Record<StepKey, string> = { amount: 'Amount and period', payout: 'Interest payout', holders: 'Who holds the deposit', nominee: 'Nominee', review: 'Review & sign' };
/** One line under each step's title (the nominee step explains itself in its first line). */
const INTROS: Partial<Record<StepKey, string>> = {
  amount: 'How much to deposit, and for how long. The rate depends on the period.',
  payout: 'When you want the interest: added at maturity, or paid out as you go.',
  holders: 'Only you, jointly with other members, or on behalf of a minor.',
  review: 'Check the details, then sign with the code sent to your mobile.',
};
const STEP_FIELDS: Record<StepKey, (k: string) => boolean> = {
  amount: (k) => k === 'principal' || k === 'tenureMonths',
  payout: (k) => k === 'payoutFrequency',
  holders: (k) => k.startsWith('holders') || k.startsWith('minor'),
  nominee: (k) => k.startsWith('nominee'),
  review: () => false,
};
const PERIODS = [12, 18, 24, 30, 36, 48, 60];
const PAYOUTS = ['ON_MATURITY', 'QUARTERLY', 'MONTHLY', 'HALF_YEARLY'] as const;
const RELATIONS: Nominee['relation'][] = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
const EMPTY_HOLDER: FdHolder = { name: '', fatherOrHusbandName: '', occupation: '', address: '', phone: '' };

const paise = (t: string) => Math.round(Number(t.replace(/[^0-9]/g, '') || 0) * 100);

export default function OpenFd() {
  const qc = useQueryClient();
  const context = useDepositContext();
  const ctx = context.data;
  const [step, setStep] = useState(0);
  const [amountText, setAmountText] = useState('');
  const [tenure, setTenure] = useState(24);
  const [payout, setPayout] = useState<FdRequestInput['payoutFrequency']>('ON_MATURITY');
  const [holding, setHolding] = useState<FdRequestInput['holding']>('SINGLE');
  const [holders, setHolders] = useState<FdHolder[]>([{ ...EMPTY_HOLDER }]);
  const [minor, setMinor] = useState<{ name: string; dob?: string; guardianRelation: string }>({ name: '', guardianRelation: 'Father' });
  const [nominee, setNominee] = useState<Nominee | undefined>();
  const [agreed, setAgreed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [signing, setSigning] = useState<{ otpRef: string; demoOtp?: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string>();

  const key = STEPS[step] ?? 'amount';
  const principal = paise(amountText);
  const nom = nominee ?? ctx?.member.nominee ?? { name: '', relation: 'Spouse' };
  const rate = ctx ? fdRateFor(tenure, ctx.slabs) : undefined;
  const input: FdRequestInput = useMemo(
    () => ({
      principal,
      tenureMonths: tenure,
      payoutFrequency: payout,
      holding,
      ...(holding === 'JOINT' ? { holders } : {}),
      ...(holding === 'MINOR' ? { minor: { name: minor.name, dob: minor.dob ?? '', guardianRelation: minor.guardianRelation } } : {}),
      nominee: { name: nom.name, relation: nom.relation, ...(nom.address ? { address: nom.address } : {}) },
    }),
    [principal, tenure, payout, holding, holders, minor, nom],
  );
  const errors = ctx ? validateFdRequest(input, { slabs: ctx.slabs, minAmount: ctx.minAmount, today: ctx.today }) : {};
  const stepErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => STEP_FIELDS[key](k)));
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const preview = (p: FdRequestInput['payoutFrequency']) => (rate && principal > 0 && ctx ? calculateFdMaturity({ principal, ratePercent: rate, tenureMonths: tenure, payout: p, openedOn: ctx.today }) : undefined);
  const m = preview(payout);
  const periods = ctx ? PERIODS.filter((p) => fdRateFor(p, ctx.slabs) !== undefined) : [];

  const next = () => {
    if (Object.keys(stepErrors).length) return setShowErrors(true);
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setShowErrors(false);
    if (signing) return setSigning(null);
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const startSigning = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      setStep(STEPS.findIndex((s) => Object.keys(errors).some((k) => STEP_FIELDS[s](k))));
      return;
    }
    setServerError(null);
    setBusy(true);
    try {
      const c = await api.myDeposits.requestSign(input);
      setSigning({ otpRef: c.otpRef, ...(c.demoOtp ? { demoOtp: c.demoOtp } : {}) });
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setServerError(isApiError(e) ? e.message : 'Could not start signing.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!signing) return;
    setBusy(true);
    setOtpError(undefined);
    try {
      const d = await api.myDeposits.create(signing.otpRef, otp);
      await qc.invalidateQueries({ queryKey: depositKeys.mine });
      router.replace({ pathname: '/deposit/[id]', params: { id: d.deposit.id } });
    } catch (e) {
      setOtpError(isApiError(e) ? (e.fieldErrors?.otp ?? e.message) : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  };

  if (!ctx)
    return (
      <Screen header={<Header title="Open a fixed deposit" onBack={() => router.back()} />}>
        {context.isError ? <Banner status="error" heading="Couldn't load" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void context.refetch() }} /> : <Skeleton height={260} radius={radius.container} />}
      </Screen>
    );

  const setHolder = (i: number, patch: Partial<FdHolder>) => setHolders((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));

  return (
    <Screen
      header={<Header title="Open a fixed deposit" onBack={back} right={busy ? <ActivityIndicator size="small" color={color.text.secondary} /> : null} />}
      footer={
        key === 'review' ? (
          signing ? (
            <Button label="Confirm & submit" size="lg" fullWidth disabled={otp.length !== 6} loading={busy} onPress={() => void confirm()} />
          ) : (
            <Button label="Sign with OTP" icon={PenLine} size="lg" fullWidth disabled={!agreed} loading={busy} onPress={() => void startSigning()} />
          )
        ) : (
          <Button label="Continue" size="lg" fullWidth onPress={next} />
        )
      }
    >
      <StepHeader step={step + 1} total={STEPS.length} title={TITLES[key]} {...(INTROS[key] ? { intro: INTROS[key] } : {})} />
      {showErrors && Object.keys(stepErrors).length ? <Banner status="error" heading="A few details are missing" description="Fix the highlighted fields to continue." /> : null}
      {serverError ? <Banner status="error" heading="Something went wrong" description={serverError} /> : null}

      {key === 'amount' && (
        <>
          <TextField label="Amount" prefix="₹" keyboardType="number-pad" value={amountText} onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))} error={err('principal')} hint={principal > 0 ? amountInWords(principal) : `Minimum ${formatINR(ctx.minAmount)}`} required />
          <Section title="Period">
            <View style={styles.chips}>
              {periods.map((p) => (
                <Pressable key={p} accessibilityRole="radio" accessibilityState={{ checked: tenure === p }} aria-checked={tenure === p} onPress={() => setTenure(p)} style={[styles.chip, tenure === p && styles.chipOn]}>
                  <Text type="label" style={{ color: tenure === p ? color.accent : color.text.secondary }}>
                    {p} months
                  </Text>
                  <Text type="supporting" tone="secondary">
                    {fdRateFor(p, ctx.slabs)}%
                  </Text>
                </Pressable>
              ))}
            </View>
            {err('tenureMonths') ? (
              <Text type="supporting" tone="error">
                {err('tenureMonths')}
              </Text>
            ) : null}
          </Section>
          {m && rate ? (
            <Card>
              <MetadataListItem label="Rate" value={`${rate}% a year`} />
              <MetadataListItem label="Matures on" value={formatDisplayDate(m.maturityDate)} />
              <MetadataListItem label="At maturity (interest added)" value={formatINR(calculateFdMaturity({ principal, ratePercent: rate, tenureMonths: tenure, payout: 'ON_MATURITY', openedOn: ctx.today }).maturityValue)} emphasis />
              <Text type="supporting" tone="secondary">
                Interest starts from the day the society receives the money.
              </Text>
            </Card>
          ) : null}
        </>
      )}

      {key === 'payout' &&
        PAYOUTS.map((p) => {
          const pv = preview(p);
          return (
            <SelectableCard
              key={p}
              title={PAYOUT_LABEL[p]}
              description={pv ? (p === 'ON_MATURITY' ? `${formatINR(pv.maturityValue)} on ${formatDisplayDate(pv.maturityDate)}` : `${formatINR(pv.periodicInterest)} each time · ${formatINR(pv.totalInterest)} in total`) : undefined}
              selected={payout === p}
              onPress={() => setPayout(p)}
            />
          );
        })}

      {key === 'holders' && (
        <>
          <SelectableCard icon={User} title="Only me" description="The deposit is in your name." selected={holding === 'SINGLE'} onPress={() => setHolding('SINGLE')} />
          <SelectableCard icon={Users} title="Jointly with family" description="Up to two more holders. Either holder or the survivor can operate it." selected={holding === 'JOINT'} onPress={() => setHolding('JOINT')} />
          <SelectableCard icon={Baby} title="For a minor" description="You hold it as guardian until they turn 18." selected={holding === 'MINOR'} onPress={() => setHolding('MINOR')} />
          {holding === 'JOINT' &&
            holders.map((h, i) => (
              <Card key={i}>
                <View style={{ gap: spacing[3] }}>
                  <View style={styles.row}>
                    <Text type="h4" style={{ flex: 1 }}>
                      Joint holder {i + 1}
                    </Text>
                    {holders.length > 1 ? <Link label="Remove" icon={Trash2} onPress={() => setHolders((hs) => hs.filter((_, j) => j !== i))} /> : null}
                  </View>
                  <TextField label="Full name" value={h.name} onChangeText={(name) => setHolder(i, { name })} error={err(`holders.${i}.name`)} required />
                  <TextField label="Father's / husband's name" value={h.fatherOrHusbandName} onChangeText={(fatherOrHusbandName) => setHolder(i, { fatherOrHusbandName })} error={err(`holders.${i}.fatherOrHusbandName`)} required />
                  <TextField label="Occupation" value={h.occupation} onChangeText={(occupation) => setHolder(i, { occupation })} />
                  <TextField label="Address" value={h.address} onChangeText={(address) => setHolder(i, { address })} error={err(`holders.${i}.address`)} required />
                  <TextField label="Mobile" prefix="+91" keyboardType="phone-pad" value={h.phone} onChangeText={(t) => setHolder(i, { phone: t.replace(/\D/g, '').slice(0, 10) })} error={err(`holders.${i}.phone`)} required />
                </View>
              </Card>
            ))}
          {holding === 'JOINT' && holders.length < 2 ? <Button label="Add another holder" variant="secondary" icon={Plus} fullWidth onPress={() => setHolders((hs) => [...hs, { ...EMPTY_HOLDER }])} /> : null}
          {holding === 'JOINT' && err('holders') ? <Banner status="error" heading={err('holders')!} /> : null}
          {holding === 'MINOR' ? (
            <Card>
              <View style={{ gap: spacing[3] }}>
                <TextField label="Minor's name" value={minor.name} onChangeText={(name) => setMinor({ ...minor, name })} error={err('minor.name')} required />
                <DateField label="Date of birth" value={minor.dob} onChange={(dob) => setMinor({ ...minor, ...(dob ? { dob } : { dob: undefined }) })} error={err('minor.dob')} required />
                <SelectField label="You are their" value={minor.guardianRelation} options={['Father', 'Mother', 'Guardian'].map((v) => ({ value: v, label: v }))} onChange={(guardianRelation) => setMinor({ ...minor, guardianRelation })} error={err('minor.guardianRelation')} required />
              </View>
            </Card>
          ) : null}
        </>
      )}

      {key === 'nominee' && (
        <>
          <Text type="body" tone="secondary">
            Who receives the deposit if something happens to {holding === 'JOINT' ? 'all holders' : 'you'}. Filled in from your profile; change it for this deposit if you like.
          </Text>
          <TextField label="Nominee's full name" value={nom.name} onChangeText={(name) => setNominee({ ...nom, name })} error={err('nominee.name')} required />
          <SelectField label="Relationship" value={nom.relation} options={RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(relation) => setNominee({ ...nom, relation: relation as Nominee['relation'] })} error={err('nominee.relation')} required />
          <TextField label="Nominee's address (optional)" value={nom.address ?? ''} onChangeText={(address) => setNominee({ ...nom, address })} />
        </>
      )}

      {key === 'review' && (
        <>
          <Card>
            <MetadataListItem label="Amount" value={formatINR(principal)} emphasis />
            <MetadataListItem label="Period" value={`${tenure} months at ${rate ?? '—'}%`} />
            <MetadataListItem label="Interest" value={PAYOUT_LABEL[payout]} />
            {m ? <MetadataListItem label={payout === 'ON_MATURITY' ? 'At maturity' : 'Each payout'} value={formatINR(payout === 'ON_MATURITY' ? m.maturityValue : m.periodicInterest)} /> : null}
            <MetadataListItem label="Held by" value={holding === 'SINGLE' ? ctx.member.name : holding === 'JOINT' ? [ctx.member.name, ...holders.map((h) => h.name)].join(', ') : `${ctx.member.name} for ${minor.name}`} />
            <MetadataListItem label="Nominee" value={`${nom.name} (${nom.relation})`} />
          </Card>
          <Section title="Rules of the deposit (form F4)">
            <Card>
              <View style={{ gap: spacing[2] }}>
                {ctx.rules.map((r, i) => (
                  <Text key={i} type="supporting" tone="secondary">
                    {i + 1}. {r}
                  </Text>
                ))}
                <Divider />
                <CheckboxInput checked={agreed} onChange={setAgreed} label="I have read the rules and request this deposit" description={`Text version ${ctx.textVersion}`} />
              </View>
            </Card>
          </Section>
          <Banner status="info" heading="After you sign" description={`Pay ${formatINR(principal)} at the counter (${ctx.payTo.counter}) or by transfer to A/c ${ctx.payTo.accountNo}. The Secretary and President then accept it and you get your FDR here.`} />
          {signing ? (
            <Card>
              <View style={{ gap: spacing[3] }}>
                <Text type="body">Enter the 6-digit code we sent to your mobile to sign.</Text>
                {signing.demoOtp ? (
                  <Text type="supporting" tone="secondary">
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  // An even three-column grid, as the loan months.
  chip: { flexBasis: '31%', flexGrow: 1, maxWidth: '33%', paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.element, borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface, gap: spacing[0.5] },
  chipOn: { borderColor: color.accent, backgroundColor: color.accentMuted },
});
