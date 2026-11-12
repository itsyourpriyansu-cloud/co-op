// ST-48m Accounts (G2, D-112): office vouchers, then the chart of accounts and the year end.
// The statements (day book, trial balance, P&L, balance sheet) are under Reports.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpenText, CalendarCheck, ListTree, Plus } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import { Filter, Loaded, RecordCard, Row, Stack2, useCan } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Header, Screen, Section, Tag } from '@/ui';
import { space } from '@/theme';

export default function Accounts() {
  const can = useCan();
  const [kind, setKind] = useState<'' | 'PAYMENT' | 'RECEIPT'>('');
  const list = useInfiniteQuery({
    queryKey: ['vouchers', kind],
    queryFn: ({ pageParam }) => api.accounts.vouchers({ page: pageParam, pageSize: 30, ...(kind ? { kind } : {}) }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Screen
      header={<Header title="Accounts" onBack={() => router.back()} />}
      refreshing={list.isRefetching && !list.isFetchingNextPage}
      onRefresh={() => void list.refetch()}
      {...(can('ledger.post') ? { footer: <Button text="New voucher" leftSlot={Plus} size="lg" fullWidth onPress={() => router.push('/staff/accounts/voucher/new')} /> } : {})}
    >
      <Card>
        <Row icon={ListTree} label="Chart of accounts" hint="Heads and the sub-heads you add" onPress={() => router.push('/staff/accounts/heads')} divider />
        <Row icon={CalendarCheck} label="Year end" hint="Annual interest, close the year, dividend" onPress={() => router.push('/staff/accounts/year-end')} divider />
        <Row icon={BookOpenText} label="Statements" hint="Day book, trial balance, P&L, balance sheet" onPress={() => router.push('/staff/reports')} />
      </Card>
      <Section title="Vouchers" description="Office expenses paid and other income received">
        <Filter
          value={kind}
          options={[
            { value: '', label: 'All' },
            { value: 'PAYMENT', label: 'Payments' },
            { value: 'RECEIPT', label: 'Receipts' },
          ]}
          onChange={setKind}
        />
        <Loaded q={list} what="vouchers">
          {() =>
            !items.length ? (
              <EmptyState icon={BookOpenText} title={kind ? 'None of this kind' : 'No vouchers yet'} description="Office expenses and other income are entered here." />
            ) : (
              <Stack2>
                {items.map((v) => (
                  <RecordCard
                    key={v.id}
                    title={v.party}
                    subtitle={`${v.voucherNo} · ${formatDisplayDate(v.date)}`}
                    caption={`${v.headName} · ${v.mode === 'CASH' ? 'Cash' : 'Bank'}`}
                    amount={`${v.kind === 'PAYMENT' ? '−' : '+'}${formatINR(v.amount)}`}
                    {...(v.reversed ? { tag: <Tag text="Cancelled" color="neutral" size="xs" /> } : {})}
                    onPress={() => router.push(`/staff/accounts/voucher/${v.id}`)}
                  />
                ))}
                {list.hasNextPage ? (
                  <View style={{ padding: space[6] }}>
                    <Button text="Load older" buttonType="secondary" fullWidth loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />
                  </View>
                ) : null}
              </Stack2>
            )
          }
        </Loaded>
      </Section>
    </Screen>
  );
}
