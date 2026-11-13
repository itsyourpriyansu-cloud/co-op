// ST-44m Payments: every receipt, and the payments members report from the app to verify.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Banknote, Inbox, Plus } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR, formatINRCompact } from '@tgs/domain';
import type { ReceiptTab } from '@tgs/types';
import { FilterBar, Loaded, RecordCard, Stack2, StatTile, TileGrid, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { PURPOSE_LABEL, REPORT_MODE_LABEL, SOURCE_LABEL } from '@/lib/staffCollections';
import { Button, EmptyState, Screen, SelectField, StatusTag, Tag, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function Payments() {
  const params = useLocalSearchParams<{ tab?: ReceiptTab }>();
  const [tab, setTab] = useState<ReceiptTab>(params.tab ?? 'ALL');
  const [text, setText] = useState('');
  const dq = useDebounced(text.trim());
  const listTab = tab === 'REPORTED' ? 'ALL' : tab;
  const list = useInfiniteQuery({
    queryKey: ['receipts', listTab, dq],
    queryFn: ({ pageParam }) => api.receipts.list({ tab: listTab, ...(dq ? { q: dq } : {}), page: pageParam, pageSize: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
    refetchInterval: 30_000,
  });
  const reports = useQuery({ queryKey: ['payment-reports'], queryFn: () => api.receipts.reports(), refetchInterval: 20_000 });
  const first = list.data?.pages[0];
  const counts = first?.counts;
  const reportedOpen = (reports.data ?? []).filter((r) => r.status === 'REPORTED').length;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const count = (n?: number) => (n !== undefined ? ` (${n.toLocaleString('en-IN')})` : '');

  return (
    <Screen
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => {
        void list.refetch();
        void reports.refetch();
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">Payments</Text>
          <Text role="caption" tone="secondary">
            {reportedOpen ? `${reportedOpen} to verify` : 'Every receipt'}
          </Text>
        </View>
        {first?.canReceive ? <Button text="New receipt" size="sm" leftSlot={Plus} onPress={() => router.push('/staff/payment/new')} /> : null}
      </View>
      <TileGrid>
        <StatTile label="Received today" value={formatINRCompact(first?.totals.today ?? 0)} sub="Counter, bank and salary" />
        <StatTile label="This month" value={formatINRCompact(first?.totals.thisMonth ?? 0)} sub="All receipts" />
        <StatTile label="Reported by members" value={String(reportedOpen)} tone={reportedOpen ? 'warning' : 'neutral'} sub="Waiting to verify" onPress={() => setTab('REPORTED')} />
      </TileGrid>
      <FilterBar search={tab === 'REPORTED' ? undefined : <TextField compact label="Search" value={text} onChangeText={setText} placeholder="Receipt no., member, General No. or reference" autoCorrect={false} />}>
        <SelectField compact label="Show" value={tab} options={[{ value: 'ALL', label: `All receipts${count(counts?.ALL)}` }, { value: 'SALARY_RECOVERY', label: `Salary recovery${count(counts?.SALARY_RECOVERY)}` }, { value: 'COUNTER', label: `Counter & bank${count(counts?.COUNTER)}` }, { value: 'REPORTED', label: `Reported by members${count(reportedOpen)}` }]} onChange={(v) => setTab(v as ReceiptTab)} />
      </FilterBar>

      {tab === 'REPORTED' ? (
        <Loaded q={reports} what="reported payments">
          {(rows) =>
            !rows.length ? (
              <EmptyState icon={Inbox} title="No reported payments" description="When members report a bank or UPI payment in the app, it appears here to verify." />
            ) : (
              <Stack2>
                {rows.map((r) => (
                  <RecordCard key={r.id} title={r.memberName} subtitle={`No. ${r.generalNo} · ${r.departmentName}`} amount={formatINR(r.amount)} tag={<StatusTag entity="paymentReport" status={r.status} audience="staff" size="xs" />} caption={`${REPORT_MODE_LABEL[r.mode]} ${r.reference} · paid ${formatDisplayDate(r.paidOn)}`} {...(r.status === 'REPORTED' && first?.canReceive !== false ? { onPress: () => router.push(`/staff/payment/verify/${r.id}`) } : {})}>
                    {r.status === 'REJECTED' && r.rejectReason ? (
                      <Text role="caption" tone="danger">
                        {r.rejectReason}
                      </Text>
                    ) : null}
                  </RecordCard>
                ))}
              </Stack2>
            )
          }
        </Loaded>
      ) : (
        <Loaded q={list} what="receipts">
            {() =>
              !items.length ? (
                <EmptyState icon={Banknote} title={dq ? 'No receipts match' : 'No receipts yet'} {...(dq ? { action: { text: 'Clear search', onPress: () => setText('') } } : {})} />
              ) : (
                <Stack2>
                  {items.map((r) => (
                    <RecordCard key={r.id} title={r.memberName} subtitle={`${r.receiptNo} · ${formatDisplayDate(r.date)}`} amount={formatINR(r.amount)} {...(r.cancelled ? { tag: <Tag text="Cancelled" color="error" size="xs" /> } : {})} onPress={() => router.push(`/staff/payment/${r.id}`)} caption={`No. ${r.generalNo} · ${SOURCE_LABEL[r.source]}${r.purpose ? ` · ${PURPOSE_LABEL[r.purpose]}` : r.cycle ? ` · ${formatCycle(r.cycle)}` : ''} · ${r.byName ?? 'Salary recovery'}`} />
                  ))}
                  {list.hasNextPage ? <View style={{ padding: space[6] }}><Button text="Load more" buttonType="secondary" fullWidth loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /></View> : null}
                </Stack2>
              )
            }
        </Loaded>
      )}
    </Screen>
  );
}
