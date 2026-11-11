// ST-30m Deposits: fixed deposits with their requests from the app, and the CRD, SRDS and Savings accounts.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Landmark, Plus } from 'lucide-react-native';
import { formatDisplayDate, formatINR, formatINRCompact } from '@tgs/domain';
import type { DepositListParams, DepositTab } from '@tgs/types';
import { FilterBar, Loaded, RecordCard, Stack2, StatTile, TileGrid, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { MATURING, TABS } from '@/lib/staffDeposits';
import { Button, EmptyState, Screen, SelectField, StatusTag, Tag, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function Deposits() {
  const [tab, setTab] = useState<DepositTab>('FD');
  const [maturing, setMaturing] = useState('');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const params: DepositListParams = { tab, ...(maturing && tab === 'FD' ? { maturingWithinDays: Number(maturing) } : {}), ...(q ? { q } : {}) };
  const list = useInfiniteQuery({
    queryKey: ['deposits', params],
    queryFn: ({ pageParam }) => api.deposits.list({ ...params, page: pageParam, pageSize: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
    refetchInterval: 20_000,
  });
  const first = list.data?.pages[0];
  const t = first?.totals;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const fd = tab === 'FD' || tab === 'REQUESTS';

  return (
    <Screen refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">Deposits</Text>
          <Text role="caption" tone="secondary">
            {t?.requestsOpen ? `${t.requestsOpen} FD requests open` : 'Fixed deposits and running accounts'}
          </Text>
        </View>
        {first?.canOpen ? <Button text="Open FD" size="sm" leftSlot={Plus} onPress={() => router.push('/staff/deposit/new')} /> : null}
      </View>
      <TileGrid>
        <StatTile label="Fixed deposits held" value={t ? formatINRCompact(t.fdPrincipal) : '—'} sub={`${first?.counts.FD ?? 0} accounts`} />
        <StatTile label="Maturing in 30 days" value={String(t?.maturing30 ?? 0)} sub="Remind, renew or pay out" />
        <StatTile label="CRD + SRDS" value={t ? formatINRCompact(t.crd + t.srds) : '—'} sub="From monthly salary recovery" />
        <StatTile label="Savings" value={t ? formatINRCompact(t.savings) : '—'} sub={`${first?.counts.SAVINGS ?? 0} accounts`} />
      </TileGrid>
      <FilterBar search={<TextField compact label="Search" value={text} onChangeText={setText} placeholder="Member, General No., account or FDR no." autoCorrect={false} />}>
        <SelectField compact label="Show" value={tab} options={TABS.map((x) => ({ value: x.value, label: `${x.label} (${first?.counts[x.value] ?? 0})` }))} onChange={(v) => setTab(v as DepositTab)} />
        {tab === 'FD' ? <SelectField compact label="Maturity" value={maturing} options={MATURING} onChange={setMaturing} /> : null}
      </FilterBar>
      <Loaded q={list} what="deposits">
        {(d) =>
          !d.pages[0]?.counts[tab] ? (
            <EmptyState icon={Landmark} title={tab === 'REQUESTS' ? 'No FD requests' : 'No accounts here'} {...(tab === 'REQUESTS' ? { description: 'Requests from the Member App and the counter appear here.' } : {})} />
          ) : !items.length ? (
            <EmptyState icon={Landmark} title="No deposits match" action={{ text: 'Clear filters', onPress: () => (setText(''), setMaturing('')) }} />
          ) : (
            <Stack2>
              {items.map((r) => (
                <RecordCard key={r.id} title={r.memberName} subtitle={`No. ${r.generalNo} · ${r.fdrNo ?? r.accountNo}${r.joint ? ' · joint' : ''}${r.minor ? ' · minor' : ''}`} amount={formatINR(r.amount)} tag={<StatusTag entity="deposit" status={r.status} audience="staff" size="xs" />} onPress={() => router.push(`/staff/deposit/${r.id}`)} caption={[`${r.ratePercent}%${r.tenureMonths ? ` · ${r.tenureMonths} mths` : r.monthlyAmount ? ' · monthly' : ''}`, fd && r.maturityDate ? `matures ${formatDisplayDate(r.maturityDate)}${r.maturityValue ? ` · ${formatINR(r.maturityValue)}` : ''}` : undefined, r.waitingOn].filter(Boolean).join(' · ')}>
                  {r.pledged ? <Tag text="Pledged" color="purple" size="xs" /> : null}
                </RecordCard>
              ))}
              {list.hasNextPage ? <View style={{ padding: space[6] }}><Button text="Load more" buttonType="secondary" fullWidth loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /></View> : null}
            </Stack2>
          )
        }
      </Loaded>
    </Screen>
  );
}
