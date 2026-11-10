// ST-20m Loans index: product, status and department filters, searched on the server a page at a time.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { HandCoins, Plus } from 'lucide-react-native';
import { formatCycle, formatINR } from '@tgs/domain';
import type { LoanListParams, LoanProductCode, LoanStatusGroup } from '@tgs/types';
import { Loaded, RecordCard, Stack2, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { GROUP_ITEMS, PRODUCT_TABS } from '@/lib/staffLoans';
import { Button, EmptyState, Screen, SelectField, StatusTag, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function Loans() {
  const [product, setProduct] = useState<LoanProductCode | 'ALL' | 'TOPUP'>('ALL');
  const [group, setGroup] = useState<LoanStatusGroup | ''>('IN_PROCESS');
  const [dept, setDept] = useState('');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const params: LoanListParams = { ...(product !== 'ALL' ? { product } : {}), ...(group ? { group } : {}), ...(dept ? { departmentId: dept } : {}), ...(q ? { q } : {}) };
  const list = useInfiniteQuery({
    queryKey: ['loans', params],
    queryFn: ({ pageParam }) => api.loans.list({ ...params, page: pageParam, pageSize: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
    refetchInterval: 20_000,
  });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const clear = () => (setText(''), setDept(''), setGroup('IN_PROCESS'), setProduct('ALL'));

  return (
    <Screen refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">Loans</Text>
          <Text role="caption" tone="secondary">
            {first ? `${first.total} found${first.scope.departmentName ? ` · ${first.scope.departmentName} only` : ''}` : 'Application to disbursement'}
          </Text>
        </View>
        {first?.canCreate ? <Button text="New" size="sm" leftSlot={Plus} onPress={() => router.push('/staff/loan/new')} /> : null}
      </View>
      <TextField label="Search" value={text} onChangeText={setText} placeholder="Member, General No. or loan no." autoCorrect={false} />
      <SelectField label="Loan type" value={product} options={PRODUCT_TABS.map((t) => ({ value: t.value, label: `${t.label} (${first?.counts.byProduct[t.value] ?? 0})` }))} onChange={(v) => setProduct(v as typeof product)} />
      <SelectField label="Status" value={group} options={GROUP_ITEMS.map((g) => ({ value: g.value, label: `${g.label}${g.value && first ? ` (${first.counts.byGroup[g.value] ?? 0})` : ''}` }))} onChange={(v) => setGroup(v as typeof group)} />
      {!first?.scope.departmentId ? <SelectField label="Department" searchable value={dept} options={[{ value: '', label: 'All departments' }, ...(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} onChange={setDept} /> : null}
      <Loaded q={list} what="loans">
        {(d) =>
          !d.pages[0]?.counts.byProduct.ALL ? (
            <EmptyState icon={HandCoins} title="No loans yet" description="Applications from the Member App and the office appear here." />
          ) : !items.length ? (
            <EmptyState icon={HandCoins} title="No loans match" action={{ text: 'Clear filters', onPress: clear }} />
          ) : (
            <Stack2>
              {items.map((r) => (
                <RecordCard key={r.id} title={r.memberName} subtitle={`No. ${r.generalNo} · ${r.loanNo ?? r.applicationNo}`} amount={formatINR(r.sanctionedAmount ?? r.appliedAmount)} tag={<StatusTag entity="loan" status={r.status} audience="staff" size="xs" />} onPress={() => router.push(`/staff/loan/${r.id}`)} caption={[`${r.productName}${r.isTopup ? ' · top-up' : ''}`, `${r.instalments} mths${r.emi ? ` · EMI ${formatINR(r.emi)}` : ''}`, r.group === 'ACTIVE' ? `outstanding ${formatINR(r.outstanding)}${r.nextDue ? `, next ${formatCycle(r.nextDue.cycle)}` : ''}` : r.group === 'IN_PROCESS' ? r.waitingOn : undefined].filter(Boolean).join(' · ')} />
              ))}
              {list.hasNextPage ? <Button text="Load more" buttonType="secondary" fullWidth loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
            </Stack2>
          )
        }
      </Loaded>
    </Screen>
  );
}
