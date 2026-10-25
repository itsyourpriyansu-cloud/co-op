// MB-11 Calculators. Loan: instalment, total interest, share deposit, and *your* limits (months left
// before retirement BR-002, EMI vs net salary cap) from your own record; "Apply with these numbers"
// opens MB-04 prefilled. FD: rate from the slab, maturity value and date (BR-017). Preview only —
// packages/domain does the maths; the server decides on a real application.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react-native';
import { calculateEmi, calculateFdMaturity, calculateNetSalary, calculateShareDeduction, checkTenureEligibility, fdRateFor, formatDisplayDate, formatINR, toPaise } from '@tgs/domain';
import type { LoanContext, PayoutFrequency, RatesReference } from '@tgs/types';
import { api } from '@/lib/api';
import { useLoanContext } from '@/lib/loans';
import { Alert, Button, Card, Divider, Header, KeyValue, NumberStepper, Screen, Segmented, SelectField, Skeleton, Tag, Text, TextField } from '@/ui';
import { color, radius, space, onBrandMuted } from '@/theme';

const rupees = (t: string) => Number(t.replace(/[^0-9]/g, '')) || 0;

export default function Calculators() {
  const params = useLocalSearchParams<{ tab?: 'loan' | 'fd' }>();
  const [tab, setTab] = useState<'loan' | 'fd'>(params.tab === 'fd' ? 'fd' : 'loan');
  const ctx = useLoanContext();
  const rates = useQuery({ queryKey: ['rates'], queryFn: api.reference.rates });
  const clock = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const loading = ctx.isLoading || rates.isLoading;
  const failed = ctx.isError || rates.isError || (!loading && (!ctx.data || !rates.data));

  return (
    <Screen header={<Header title="Calculators" onBack={() => router.back()} />}>
      <Segmented label="Calculate" value={tab} options={[{ value: 'loan', label: 'Loan instalment' }, { value: 'fd', label: 'Fixed deposit' }]} onChange={setTab} />
      {loading ? (
        <Skeleton height={360} radius={radius.card} />
      ) : failed ? (
        <Alert type="error" heading="Couldn't load the rates" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void Promise.all([ctx.refetch(), rates.refetch()]) }} />
      ) : tab === 'loan' ? (
        <LoanCalc ctx={ctx.data!} />
      ) : (
        <FdCalc rates={rates.data!} today={clock.data?.today ?? new Date().toISOString().slice(0, 10)} />
      )}
    </Screen>
  );
}

function LoanCalc({ ctx }: { ctx: LoanContext }) {
  const products = ctx.products.filter((p) => p.code !== 'DEPOSIT');
  const [code, setCode] = useState(products[0]?.code ?? 'ORDINARY');
  const product = products.find((p) => p.code === code) ?? products[0]!;
  const [amountText, setAmountText] = useState('100000');
  const tenure = checkTenureEligibility(ctx.member.leftoverMonths, 1, product.maxInstalments);
  const maxMonths = Math.max(1, tenure.maxAllowed);
  const [monthsWanted, setMonths] = useState(Math.min(60, maxMonths));
  const months = Math.min(monthsWanted, maxMonths);
  const amount = toPaise(rupees(amountText));

  const r = useMemo(() => {
    if (amount <= 0) return undefined;
    const emi = calculateEmi(amount, product.ratePercent, months, product.emiMethod);
    const net = calculateNetSalary(ctx.pay.grossSalary, ctx.pay.govtLoanDeductions, ctx.pay.otherLoanDeductions).net;
    const capacity = Math.round((net * ctx.settings.emiToNetSalaryMaxPercent) / 100);
    const share = calculateShareDeduction(amount, product.shareDepositPercent, ctx.shares.shareDepositBalance);
    return { emi, net, capacity, share };
  }, [amount, months, product, ctx]);

  const tooMuch = amount > product.maxAmount;
  const tooLittle = amount > 0 && amount < product.minAmount;
  const running = ctx.activeProducts.includes(product.code);
  const noRoom = tenure.maxAllowed < 1;

  return (
    <>
      <Card>
        <View style={{ gap: space[8] }}>
          <SelectField label="Loan" value={code} options={products.map((p) => ({ value: p.code, label: p.name, hint: `${p.ratePercent}%` }))} onChange={(v) => setCode(v as typeof code)} />
          <TextField
            label="Amount"
            prefix="₹"
            keyboardType="number-pad"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))}
            error={tooMuch ? `The most for ${product.name} is ${formatINR(product.maxAmount)}.` : tooLittle ? `The least is ${formatINR(product.minAmount)}.` : undefined}
            hint={`${formatINR(product.minAmount)} to ${formatINR(product.maxAmount)}`}
          />
          <View style={{ gap: space[3] }}>
            <Text role="label">Months to repay</Text>
            <NumberStepper value={months} min={1} max={maxMonths} step={months >= 12 ? 6 : 1} onChange={setMonths} accessibilityLabel="Months to repay" />
            <Text role="caption" tone="tertiary">
              Up to {maxMonths} months for you{tenure.binding === 'retirement' ? ` (you retire in ${ctx.member.leftoverLabel})` : ` (${product.name} limit)`}.
            </Text>
          </View>
        </View>
      </Card>

      {r && !tooMuch ? (
        <View style={styles.result}>
          <Text role="caption" style={{ color: onBrandMuted }}>
            {r.emi.constant ? 'Monthly instalment' : 'First instalment (gets smaller every month)'}
          </Text>
          <Text role="display" tone="onBrand" accessibilityLiveRegion="polite">
            {formatINR(r.emi.firstInstalment)}
          </Text>
          <Text role="caption" style={{ color: onBrandMuted }}>
            {months} months at {product.ratePercent}% a year{!r.emi.constant ? ` · last ${formatINR(r.emi.lastInstalment)}` : ''}
          </Text>
        </View>
      ) : null}

      {r && !tooMuch ? (
        <Card>
          <KeyValue label="Total interest" value={formatINR(r.emi.totalInterest)} />
          <KeyValue label="Total you repay" value={formatINR(r.emi.totalPayable)} emphasis />
          {product.shareDepositPercent ? <KeyValue label={`Share deposit kept (${product.shareDepositPercent}%)`} value={r.share.deduction ? formatINR(r.share.deduction) : 'Already covered'} /> : null}
          {product.shareDepositPercent ? <KeyValue label="You would receive about" value={formatINR(amount - r.share.deduction)} /> : null}
          <Divider />
          <Check ok={!noRoom} text={noRoom ? 'You are too close to retirement for a new loan.' : `Repaid before you retire (${ctx.member.leftoverLabel} left).`} />
          <Check ok={r.emi.firstInstalment <= r.capacity} warn text={r.emi.firstInstalment <= r.capacity ? `Within ${ctx.settings.emiToNetSalaryMaxPercent}% of your net salary (${formatINR(r.capacity)}).` : `More than ${ctx.settings.emiToNetSalaryMaxPercent}% of your net salary (${formatINR(r.capacity)}). The office may ask for a smaller amount.`} />
          {running && !product.topupAllowed ? <Check ok={false} text={`You already have a running ${product.name}.`} /> : null}
          {running && product.topupAllowed ? <Check ok warn text={`You have a running ${product.name}; this would be a top-up that first closes it.`} /> : null}
        </Card>
      ) : null}

      <Text role="caption" tone="tertiary">
        An estimate from today&apos;s rates and your record. The society confirms the amount when you apply.
      </Text>
      <Button
        text="Apply with these numbers"
        rightSlot={ArrowRight}
        size="lg"
        fullWidth
        disabled={!r || tooMuch || tooLittle || noRoom}
        onPress={() => router.push({ pathname: '/loan/apply', params: { product: product.code, amount: String(amount), months: String(months) } })}
      />
    </>
  );
}

function Check({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  const Icon = ok ? CircleCheck : TriangleAlert;
  return (
    <View style={styles.check}>
      <Icon size={18} color={ok ? color.status.success.fg : warn ? color.status.warning.fg : color.status.danger.fg} />
      <Text role="caption" tone={ok ? 'secondary' : warn ? 'warning' : 'danger'} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const PAYOUTS: Array<{ value: PayoutFrequency; label: string }> = [
  { value: 'ON_MATURITY', label: 'At maturity' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

function FdCalc({ rates, today }: { rates: RatesReference; today: string }) {
  const slabs = rates.fdSlabs;
  const minMonths = Math.min(...slabs.map((s) => s.fromMonths));
  const maxMonths = Math.max(...slabs.map((s) => s.toMonths));
  const [amountText, setAmountText] = useState('100000');
  const [months, setMonths] = useState(Math.max(minMonths, Math.min(12, maxMonths)));
  const [payout, setPayout] = useState<PayoutFrequency>('ON_MATURITY');
  const principal = toPaise(rupees(amountText));
  const rate = fdRateFor(months, slabs);
  const r = rate !== undefined && principal > 0 ? calculateFdMaturity({ principal, ratePercent: rate, tenureMonths: months, payout, openedOn: today }) : undefined;

  return (
    <>
      <Card>
        <View style={{ gap: space[8] }}>
          <TextField label="Deposit amount" prefix="₹" keyboardType="number-pad" value={amountText} onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))} />
          <View style={{ gap: space[3] }}>
            <View style={styles.head}>
              <Text role="label" style={{ flex: 1 }}>
                For how long
              </Text>
              {rate !== undefined ? <Tag text={`${rate}% a year`} color="primary" size="xs" /> : null}
            </View>
            <NumberStepper value={months} min={minMonths} max={maxMonths} step={months >= 12 ? 3 : 1} onChange={setMonths} accessibilityLabel="Months" />
          </View>
          <Segmented label="Interest paid" value={payout} options={PAYOUTS} onChange={setPayout} />
        </View>
      </Card>
      {rate === undefined ? <Alert type="warning" heading="No rate for this period" description="Choose a period in one of the society's FD slabs." /> : null}
      {r ? (
        <View style={styles.result}>
          <Text role="caption" style={{ color: onBrandMuted }}>
            {payout === 'ON_MATURITY' ? 'You get at maturity' : payout === 'MONTHLY' ? 'Interest every month' : 'Interest every quarter'}
          </Text>
          <Text role="display" tone="onBrand" accessibilityLiveRegion="polite">
            {formatINR(payout === 'ON_MATURITY' ? r.maturityValue : r.periodicInterest)}
          </Text>
          <Text role="caption" style={{ color: onBrandMuted }}>
            Matures around {formatDisplayDate(r.maturityDate)}
          </Text>
        </View>
      ) : null}
      {r ? (
        <Card>
          <KeyValue label="You deposit" value={formatINR(principal)} />
          <KeyValue label="Total interest" value={formatINR(r.totalInterest)} emphasis />
          {payout !== 'ON_MATURITY' ? <KeyValue label="Returned at maturity" value={formatINR(r.maturityValue)} /> : null}
        </Card>
      ) : null}
      <Text role="caption" tone="tertiary">
        Interest on maturity is compounded quarterly. Rates as set by the society today.
      </Text>
      <Button text="Open a fixed deposit" rightSlot={ArrowRight} size="lg" fullWidth disabled={!r} onPress={() => router.push('/deposit/open')} />
    </>
  );
}

const styles = StyleSheet.create({
  result: { backgroundColor: color.brand.solid, borderRadius: radius.card, padding: space[10], gap: space[2] },
  check: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
