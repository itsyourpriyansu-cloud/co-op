// MB-07 Surety requests: Requests (waiting for my answer) · I am surety for (loans I guarantee).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Handshake } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import type { SuretyRequest } from '@tgs/types';
import { api } from '@/lib/api';
import { Alert, Card, EmptyState, Header, Screen, Segmented, Skeleton, StatusTag, Text } from '@/ui';
import { color, radius, space } from '@/theme';

const suretyKey = ['surety-requests'] as const;

function RequestCard({ r }: { r: SuretyRequest }) {
  return (
    <Card onPress={() => router.push({ pathname: '/surety/[loanId]', params: { loanId: r.loanId } })} accessibilityLabel={`${r.borrower.name}, ${r.productName} ${formatINR(r.amount)}`}>
      <View style={{ gap: space[4] }}>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="cardTitle">{r.borrower.name}</Text>
            <Text role="caption" tone="tertiary">
              No. {r.borrower.generalNo} · {r.borrower.departmentName}
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.tertiary} />
        </View>
        <View style={styles.row}>
          <Text role="amount" style={{ flex: 1 }}>
            {formatINR(r.amount)}
          </Text>
          <StatusTag entity="surety" status={r.myStatus} size="xs" />
        </View>
        <Text role="caption" tone="secondary">
          {r.productName} · {r.instalments} months · EMI {formatINR(r.emi)}
          {r.status === 'ACTIVE' ? ` · outstanding ${formatINR(r.outstanding)}` : ` · asked ${formatDisplayDate(r.appliedOn)}`}
        </Text>
      </View>
    </Card>
  );
}

export default function SuretyRequests() {
  const q = useQuery({ queryKey: suretyKey, queryFn: api.surety.list, refetchInterval: 5000 });
  const [tab, setTab] = useState<'requests' | 'guaranteeing'>('requests');
  const rows = q.data?.[tab] ?? [];
  return (
    <Screen header={<Header title="Surety requests" onBack={() => router.back()} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Segmented
        label="Show"
        value={tab}
        options={[
          { value: 'requests', label: `Requests ${q.data?.requests.length || ''}`.trim() },
          { value: 'guaranteeing', label: 'I am surety for' },
        ]}
        onChange={setTab}
      />
      {q.isLoading ? (
        <Skeleton height={140} radius={radius.card} />
      ) : q.isError ? (
        <Alert type="error" heading="Couldn't load your requests" action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : rows.length ? (
        <View style={{ gap: space[6] }}>
          {rows.map((r) => (
            <RequestCard key={r.loanId} r={r} />
          ))}
        </View>
      ) : (
        <EmptyState icon={Handshake} title={tab === 'requests' ? 'No requests waiting' : 'You are not a surety on any loan'} description={tab === 'requests' ? 'When a member names you as a surety, the request appears here.' : undefined} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
