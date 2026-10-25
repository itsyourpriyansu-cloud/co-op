// MB-10 receipt view: number, date, amount in words, what it paid month by month and head by head.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import { Logo } from '@/components/Logo';
import { SOURCE_LABEL, useMyReceipt } from '@/lib/payments';
import { Alert, Card, Divider, Header, KeyValue, Screen, Section, Skeleton, Text } from '@/ui';
import { radius, space } from '@/theme';

export default function ReceiptView() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useMyReceipt(id);
  const d = q.data;
  const r = d?.receipt;
  return (
    <Screen header={<Header title="Receipt" onBack={() => router.back()} />}>
      {q.isLoading ? (
        <Skeleton height={300} radius={radius.card} />
      ) : !d || !r ? (
        <Alert type="error" heading="Couldn't load this receipt" description="Go back and try again." />
      ) : (
        <>
          <Card>
            <View style={{ gap: space[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
                <Logo size={40} />
                <View style={{ flex: 1 }}>
                  <Text role="label">TGSECCSL · Regd. No. P-929</Text>
                  <Text role="caption" tone="tertiary">
                    Receipt {r.receiptNo}
                  </Text>
                </View>
              </View>
              <Divider />
              <Text role="display">{formatINR(r.amount)}</Text>
              <Text role="caption" tone="secondary">
                {d.amountInWords}
              </Text>
              <KeyValue label="Date" value={formatDisplayDate(r.date)} />
              <KeyValue label="Paid by" value={`${SOURCE_LABEL[r.source]}${r.reference ? ` · ${r.reference}` : ''}`} />
              {r.byName ? <KeyValue label="Received by" value={r.byName} /> : null}
            </View>
          </Card>
          {d.lines.length ? (
            <Section title="What it paid">
              <Card>
                <View style={{ gap: space[3] }}>
                  {d.lines.map((l, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: space[4] }}>
                      <Text role="caption" style={{ flex: 1 }}>
                        {l.cycle ? `${formatCycle(l.cycle)} · ` : ''}
                        {l.label}
                        {l.loanNo ? ` · ${l.loanNo}` : ''}
                      </Text>
                      <Text role="caption">{formatINR(l.amount)}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
