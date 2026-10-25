// MB-08 My deposits: what I hold (FD principal, CRD, SRDS, Savings), FD requests in progress, and
// "Open an FD" (MB-15). Card → MB-09.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, PiggyBank, Plus } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import type { DepositRow } from '@tgs/types';
import { SCHEME_LABEL, segmentOf, useMyDeposits, type DepositSegment } from '@/lib/deposits';
import { Alert, Button, Card, EmptyState, Screen, Segmented, Skeleton, StatusTag, Tag, Text } from '@/ui';
import { color, radius, space } from '@/theme';

const SEGMENTS: Array<{ value: DepositSegment; label: string }> = [
  { value: 'FD', label: 'Fixed' },
  { value: 'REQUESTS', label: 'Requests' },
  { value: 'OTHER', label: 'CRD & savings' },
];

function DepositCard({ row }: { row: DepositRow }) {
  const isFd = row.scheme === 'FD';
  return (
    <Card onPress={() => router.push({ pathname: '/deposit/[id]', params: { id: row.id } })} accessibilityLabel={`${SCHEME_LABEL[row.scheme]} ${formatINR(row.amount)}, ${row.status}`}>
      <View style={{ gap: space[4] }}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="cardTitle">{isFd ? `${row.tenureMonths ?? ''} months at ${row.ratePercent}%` : SCHEME_LABEL[row.scheme]}</Text>
            <Text role="caption" tone="tertiary">
              {row.fdrNo ?? row.accountNo} · since {formatDisplayDate(row.openedOn)}
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.tertiary} />
        </View>
        <View style={styles.row}>
          <Text role="amount" style={{ flex: 1 }}>
            {formatINR(row.amount)}
          </Text>
          {row.pledged ? <Tag text="Pledged" size="xs" color="purple" /> : null}
          <StatusTag entity="deposit" status={row.status} size="xs" />
        </View>
        {isFd && row.maturityDate && row.status === 'ACTIVE' ? (
          <Text role="caption" tone="secondary">
            Matures {formatDisplayDate(row.maturityDate)}
            {row.maturityValue ? ` · ${formatINR(row.maturityValue)}` : ''}
            {row.daysToMaturity !== undefined && row.daysToMaturity <= 30 ? ` · in ${row.daysToMaturity} days` : ''}
          </Text>
        ) : row.waitingOn ? (
          <Text role="caption" tone="secondary">
            Now with {row.waitingOn}
          </Text>
        ) : !isFd && row.monthlyAmount ? (
          <Text role="caption" tone="secondary">
            {formatINR(row.monthlyAmount)} a month from your salary · {row.ratePercent}% a year
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function Deposits() {
  const deposits = useMyDeposits();
  const [segment, setSegment] = useState<DepositSegment>('FD');
  const all = deposits.data ?? [];
  const rows = all.filter((d) => segmentOf(d) === segment);
  const count = (s: DepositSegment) => all.filter((d) => segmentOf(d) === s).length;
  const fdTotal = all.filter((d) => segmentOf(d) === 'FD' && d.status === 'ACTIVE').reduce((s, d) => s + d.amount, 0);
  const otherTotal = all.filter((d) => d.scheme !== 'FD').reduce((s, d) => s + d.amount, 0);

  return (
    <Screen refreshing={deposits.isRefetching} onRefresh={() => void deposits.refetch()}>
      <View style={styles.row}>
        <Text role="pageTitle" style={{ flex: 1 }}>
          Deposits
        </Text>
        <Button text="Open FD" size="sm" leftSlot={Plus} onPress={() => router.push('/deposit/open')} />
      </View>

      {deposits.data ? (
        <View style={styles.hero}>
          <Text role="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Saved with the society
          </Text>
          <Text role="display" tone="onBrand">
            {formatINR(fdTotal + otherTotal)}
          </Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text role="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Fixed deposits
              </Text>
              <Text role="bodyStrong" tone="onBrand">
                {formatINR(fdTotal)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text role="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>
                CRD, SRDS & savings
              </Text>
              <Text role="bodyStrong" tone="onBrand">
                {formatINR(otherTotal)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <Segmented label="Show" value={segment} options={SEGMENTS.map((s) => ({ value: s.value, label: `${s.label} ${count(s.value) || ''}`.trim() }))} onChange={setSegment} />

      {deposits.isLoading ? (
        <View style={{ gap: space[6] }}>
          <Skeleton height={140} radius={radius.card} />
          <Skeleton height={120} radius={radius.card} />
        </View>
      ) : deposits.isError ? (
        <Alert type="error" heading="Couldn't load your deposits" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void deposits.refetch() }} />
      ) : rows.length ? (
        <View style={{ gap: space[6] }}>
          {rows.map((r) => (
            <DepositCard key={r.id} row={r} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={PiggyBank}
          title={segment === 'FD' ? 'No fixed deposits yet' : segment === 'REQUESTS' ? 'No requests in progress' : 'No other deposits'}
          description={segment === 'OTHER' ? 'CRD is deducted from your salary every month once you are a member.' : 'Request an FD here, pay at the counter or by transfer, and the society accepts it.'}
          {...(segment !== 'OTHER' ? { action: { text: 'Open a fixed deposit', onPress: () => router.push('/deposit/open') } } : {})}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  hero: { backgroundColor: color.brand.solid, borderRadius: radius.card, padding: space[10], gap: space[3] },
  heroRow: { flexDirection: 'row', gap: space[6], marginTop: space[4] },
});
