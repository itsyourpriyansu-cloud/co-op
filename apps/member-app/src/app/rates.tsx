// MB-16 Interest rates (read-only, docs/05, docs/14 M2). Loan products, FD slabs and deposit rates come
// live from Settings (ST-64/65), so a rate changed on the web shows here on the next refresh.
// The EMI estimate uses packages/domain for the preview only; the server decides on a real application.
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { calculateEmi, formatDisplayDate, formatINR, toPaise } from '@tgs/domain';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Card, Divider, Header, MetadataListItem, MonthPicker, Screen, Section, SelectField, Skeleton, Token, Text, TextField } from '@/ui';
import { color, radius, spacing } from '@/theme';

export default function Rates() {
  const { ready, session } = useAuth();
  const rates = useQuery({ queryKey: ['rates'], queryFn: api.reference.rates });
  const { refetch } = rates;
  // Coming back to the screen re-reads the rates (the exit test: change on the web → refresh here).
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (ready && !session) return <Redirect href="/" />;
  return (
    <Screen header={<Header title="Interest rates" onBack={() => router.back()} />} refreshing={rates.isRefetching} onRefresh={() => void refetch()}>
      {rates.isLoading ? (
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={180} radius={radius.container} />
          <Skeleton height={240} radius={radius.container} />
        </View>
      ) : rates.isError || !rates.data ? (
        <Banner status="error" heading="Couldn't load the rates" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void rates.refetch() }} />
      ) : (
        <>
          <Text type="body" tone="secondary">
            {rates.data.updatedAt ? `Rates set by the society. Last changed ${formatDisplayDate(rates.data.updatedAt.slice(0, 10))}.` : 'Rates set by the society.'}
          </Text>
          <EmiEstimate products={rates.data.loanProducts} />

          <Section title="Loans">
            <Card padded={false}>
              {rates.data.loanProducts.map((p, i) => (
                <View key={p.code} style={[styles.row, i > 0 && styles.divider]}>
                  <View style={{ flex: 1, gap: spacing[0.5] }}>
                    <Text type="label">{p.name}</Text>
                    <Text type="supporting" tone="secondary">
                      Up to {formatINR(p.maxAmount)} · {p.instalmentOptions.join(' / ')} months{p.suretiesRequired ? ` · ${p.suretiesRequired} ${p.suretiesRequired === 1 ? 'surety' : 'sureties'}` : ''}
                    </Text>
                  </View>
                  <Text type="h4">{p.ratePercent}%</Text>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="Fixed deposits" description="Interest a year, by how long you keep the deposit.">
            <Card padded={false}>
              {rates.data.fdSlabs.map((s, i) => (
                <View key={`${s.fromMonths}-${s.toMonths}`} style={[styles.row, i > 0 && styles.divider]}>
                  <Text type="body" style={{ flex: 1 }}>
                    {s.fromMonths}–{s.toMonths} months
                  </Text>
                  <Text type="h4">{s.ratePercent}%</Text>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="Other deposits">
            <Card>
              <MetadataListItem label="Savings" value={`${rates.data.savingsRatePercent}%`} />
              <MetadataListItem label="CRD" value={`${rates.data.crdRatePercent}%`} />
              <MetadataListItem label="SRDS" value={`${rates.data.srdsRatePercent}%`} />
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

type Product = NonNullable<Awaited<ReturnType<typeof api.reference.rates>>>['loanProducts'][number];

function EmiEstimate({ products }: { products: Product[] }) {
  const [code, setCode] = useState(products[0]?.code ?? '');
  const [amount, setAmount] = useState('100000');
  const product = products.find((p) => p.code === code) ?? products[0];
  // D-123: only the periods the society offers (this is the public rate card, so none is switched off).
  const choices = useMemo(() => (product?.instalmentOptions ?? []).map((m) => ({ months: m, allowed: true })), [product]);
  const [months, setMonths] = useState(0);
  const tenure = choices.some((c) => c.months === months) ? months : (choices[0]?.months ?? 0);
  const rupees = Number(amount.replace(/[^0-9]/g, '')) || 0;

  const result = useMemo(() => {
    if (!product || rupees <= 0 || tenure <= 0) return undefined;
    return calculateEmi(toPaise(rupees), product.ratePercent, tenure, product.emiMethod);
  }, [product, rupees, tenure]);

  if (!product) return null;
  const overMax = toPaise(rupees) > product.maxAmount;

  return (
    <Card>
      <View style={{ gap: spacing[4] }}>
        <View style={styles.head}>
          <Text type="h4" style={{ flex: 1 }}>
            Estimate your instalment
          </Text>
          <Token text={`${product.ratePercent}% a year`} status="info" size="xs" />
        </View>
        <SelectField label="Loan" value={code} options={products.map((p) => ({ value: p.code, label: p.name, hint: `${p.ratePercent}%` }))} onChange={setCode} />
        <TextField label="Amount" prefix="₹" keyboardType="number-pad" value={amount} onChangeText={setAmount} error={overMax ? `The most for this loan is ${formatINR(product.maxAmount)}.` : undefined} />
        <MonthPicker label="Months" value={tenure} choices={choices} onChange={setMonths} />
        <Divider />
        {result ? (
          <View style={{ gap: spacing[1] }}>
            <Text type="supporting" tone="secondary">
              {result.constant ? 'Monthly instalment' : 'First instalment (it gets smaller every month)'}
            </Text>
            <Text type="h1" accessibilityLiveRegion="polite">
              {formatINR(result.firstInstalment)}
            </Text>
            <MetadataListItem label="Total interest" value={formatINR(result.totalInterest)} />
            <MetadataListItem label="Total payable" value={formatINR(result.totalPayable)} />
          </View>
        ) : (
          <Text type="supporting" tone="secondary">
            Enter an amount to see the instalment.
          </Text>
        )}
        <Text type="supporting" tone="secondary">
          An estimate only. The society confirms the amount when you apply.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
});
