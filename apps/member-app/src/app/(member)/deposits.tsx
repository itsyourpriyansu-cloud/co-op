// MB-08 My deposits: what I hold (FD principal, CRD, SRDS, Savings), FD requests in progress, and
// "Open an FD" (MB-15). Card → MB-09.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, PiggyBank, Plus } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import type { DepositRow } from '@tgs/types';
import { SCHEME_LABEL, segmentOf, useMyDeposits, type DepositSegment } from '@/lib/deposits';
import { Banner, Button, Card, EmptyState, heroSurface, Screen, SegmentedControl, Skeleton, StatusToken, Token, Text } from '@/ui';
import { color, radius, spacing } from '@/theme';

const SEGMENTS: Array<{ value: DepositSegment; label: string }> = [
  { value: 'FD', label: 'Fixed' },
  { value: 'REQUESTS', label: 'Requests' },
  { value: 'OTHER', label: 'CRD & savings' },
];

function DepositCard({ row }: { row: DepositRow }) {
  const isFd = row.scheme === 'FD';
  return (
    <Card onPress={() => router.push({ pathname: '/deposit/[id]', params: { id: row.id } })}>
      <View style={{ gap: spacing[2] }}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <Text type="h4">{isFd ? `${row.tenureMonths ?? ''} months at ${row.ratePercent}%` : SCHEME_LABEL[row.scheme]}</Text>
            <Text type="supporting" tone="secondary">
              {row.fdrNo ?? row.accountNo} · since {formatDisplayDate(row.openedOn)}
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.secondary} />
        </View>
        <View style={styles.row}>
          <Text type="amount" style={{ flex: 1 }}>
            {formatINR(row.amount)}
          </Text>
          {row.pledged ? <Token text="Pledged" size="xs" status="approval" /> : null}
          <StatusToken entity="deposit" status={row.status} size="xs" />
        </View>
        {isFd && row.maturityDate && row.status === 'ACTIVE' ? (
          <Text type="supporting" tone="secondary">
            Matures {formatDisplayDate(row.maturityDate)}
            {row.maturityValue ? ` · ${formatINR(row.maturityValue)}` : ''}
            {row.daysToMaturity !== undefined && row.daysToMaturity <= 30 ? ` · in ${row.daysToMaturity} days` : ''}
          </Text>
        ) : row.waitingOn ? (
          <Text type="supporting" tone="secondary">
            Now with {row.waitingOn}
          </Text>
        ) : !isFd && row.monthlyAmount ? (
          <Text type="supporting" tone="secondary">
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
        <Text type="h1" style={{ flex: 1 }}>
          Deposits
        </Text>
        <Button label="Open FD" size="sm" icon={Plus} onPress={() => router.push('/deposit/open')} />
      </View>

      {deposits.data ? (
        <View style={styles.hero}>
          <Text type="supporting" weight="semibold" tone="goldOnAccent">
            Saved with the society
          </Text>
          <Text type="display-2" tone="onAccent">
            {formatINR(fdTotal + otherTotal)}
          </Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text type="supporting" style={{ color: color.text.onAccentMuted }}>
                Fixed deposits
              </Text>
              <Text type="body" weight="medium" tone="onAccent">
                {formatINR(fdTotal)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text type="supporting" style={{ color: color.text.onAccentMuted }}>
                CRD, SRDS & savings
              </Text>
              <Text type="body" weight="medium" tone="onAccent">
                {formatINR(otherTotal)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <SegmentedControl label="Show" hideLabel value={segment} options={SEGMENTS.map((s) => ({ value: s.value, label: `${s.label} ${count(s.value) || ''}`.trim() }))} onChange={setSegment} />

      {deposits.isLoading ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton height={140} radius={radius.container} />
          <Skeleton height={120} radius={radius.container} />
        </View>
      ) : deposits.isError ? (
        <Banner status="error" heading="Couldn't load your deposits" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void deposits.refetch() }} />
      ) : rows.length ? (
        <View style={{ gap: spacing[3] }}>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  hero: { ...heroSurface, padding: spacing[5], gap: spacing[1.5] },
  heroRow: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
});
