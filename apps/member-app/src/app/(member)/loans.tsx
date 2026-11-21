// MB-03 My loans: In process · Active · Closed · Drafts. Card → MB-04. "Apply for a loan" → MB-05.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, HandCoins, Plus } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR, loanHistoryCounts } from '@tgs/domain';
import type { LoanRow, LoanStatusGroup } from '@tgs/types';
import { SEGMENTS, useMyLoans } from '@/lib/loans';
import { Banner, Button, Card, EmptyState, Screen, SegmentedControl, Skeleton, StatusToken, Text } from '@/ui';
import { color, radius, spacing } from '@/theme';

function LoanCard({ row }: { row: LoanRow }) {
  return (
    <Card onPress={() => router.push({ pathname: '/loan/[id]', params: { id: row.id } })}>
      <View style={{ gap: spacing[2] }}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <Text type="h4">{row.productName}</Text>
            <Text type="supporting" tone="secondary">
              {row.loanNo ?? row.applicationNo} · {formatDisplayDate(row.appliedOn)}
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.secondary} />
        </View>
        <View style={styles.row}>
          <Text type="amount" style={{ flex: 1 }}>
            {formatINR(row.sanctionedAmount ?? row.appliedAmount)}
          </Text>
          <StatusToken entity="loan" status={row.status} size="xs" />
        </View>
        {row.group === 'ACTIVE' ? (
          <Text type="supporting" tone="secondary">
            Outstanding {formatINR(row.outstanding)}
            {row.nextDue ? ` · next EMI ${formatINR(row.nextDue.amount)} in ${formatCycle(row.nextDue.cycle)}` : ''}
          </Text>
        ) : row.group === 'IN_PROCESS' && row.waitingOn ? (
          <Text type="supporting" tone="secondary">
            Waiting on {row.waitingOn}
          </Text>
        ) : row.group === 'DRAFT' ? (
          <Text type="supporting" tone="secondary">
            Not submitted yet. Tap to continue.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export default function Loans() {
  const loans = useMyLoans();
  const [segment, setSegment] = useState<LoanStatusGroup>('IN_PROCESS');
  const rows = (loans.data ?? []).filter((r) => (segment === 'CLOSED' ? r.group === 'CLOSED' || r.group === 'REJECTED' : r.group === segment));
  const count = (g: LoanStatusGroup) => (loans.data ?? []).filter((r) => (g === 'CLOSED' ? r.group === 'CLOSED' || r.group === 'REJECTED' : r.group === g)).length;

  return (
    <Screen refreshing={loans.isRefetching} onRefresh={() => void loans.refetch()}>
      <View style={styles.row}>
        <Text type="h1" style={{ flex: 1 }}>
          Loans
        </Text>
        <Button label="Apply" size="sm" icon={Plus} onPress={() => router.push('/loan/apply')} />
      </View>
      {/* D-131: the member's loan record at a glance. */}
      {loans.data?.length ? (
        <Text type="supporting" tone="secondary">
          {(({ applied, approved, rejected }) => `Applied ${applied} · Approved ${approved} · Rejected ${rejected}`)(loanHistoryCounts(loans.data.map((r) => r.status)))}
        </Text>
      ) : null}
      <SegmentedControl label="Show" value={segment} options={SEGMENTS.map((s) => ({ value: s.value, label: `${s.label} ${count(s.value) || ''}`.trim() }))} onChange={setSegment} />
      {loans.isLoading ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton height={120} radius={radius.container} />
          <Skeleton height={120} radius={radius.container} />
        </View>
      ) : loans.isError ? (
        <Banner status="error" heading="Couldn't load your loans" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void loans.refetch() }} />
      ) : rows.length ? (
        <View style={{ gap: spacing[3] }}>
          {rows.map((r) => (
            <LoanCard key={r.id} row={r} />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={HandCoins}
          title={segment === 'IN_PROCESS' ? 'No applications in process' : segment === 'ACTIVE' ? 'No running loans' : segment === 'DRAFT' ? 'No drafts' : 'No closed loans'}
          description={segment === 'IN_PROCESS' || segment === 'DRAFT' ? 'Apply from your phone in a few minutes. Your sureties confirm in their app.' : undefined}
          {...(segment === 'IN_PROCESS' || segment === 'DRAFT' ? { action: { text: 'Apply for a loan', onPress: () => router.push('/loan/apply') } } : {})}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
