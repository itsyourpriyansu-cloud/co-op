// ST-69m Audit log (G1, D-111): every change and sign-in, newest first. Read only.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react-native';
import { formatDisplayDateTime } from '@tgs/domain';
import type { AuditLogParams } from '@tgs/types';
import { FilterBar, Loaded, RecordCard, Stack2, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, DateField, EmptyState, Header, Screen, SelectField, TextField } from '@/ui';
import { space } from '@/theme';

export default function AuditLog() {
  const [text, setText] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const q = useDebounced(text.trim());
  const params: AuditLogParams = { ...(q ? { q } : {}), ...(entity ? { entity } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const list = useInfiniteQuery({
    queryKey: ['audit', params],
    queryFn: ({ pageParam }) => api.audit.list({ ...params, page: pageParam, pageSize: 30 }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Boolean(q || entity || from || to);

  return (
    <Screen header={<Header title="Audit log" onBack={() => router.back()} />} refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()}>
      <FilterBar search={<TextField compact label="Search" value={text} onChangeText={setText} placeholder="Name, record number or what happened" autoCorrect={false} />}>
        <SelectField compact label="Record type" value={entity} options={[{ value: '', label: 'All records' }, ...(first?.entities ?? []).map((x) => ({ value: x, label: x }))]} onChange={setEntity} />
      </FilterBar>
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={setTo} />
        </View>
      </View>
      <Loaded q={list} what="the audit log">
        {() =>
          !items.length ? (
            <EmptyState icon={ScrollText} title={filtered ? 'Nothing matches' : 'Nothing recorded yet'} {...(filtered ? { action: { text: 'Clear filters', onPress: () => (setText(''), setEntity(''), setFrom(undefined), setTo(undefined)) } } : {})} />
          ) : (
            <Stack2>
              {items.map((r) => (
                <RecordCard key={r.id} title={r.summary} subtitle={`${r.actorName ?? 'System'} · ${formatDisplayDateTime(r.at)}`} caption={`${r.entity}${r.entityId ? ` · ${r.entityId}` : ''}`} onPress={() => router.push(`/staff/audit/${r.id}`)} />
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
    </Screen>
  );
}
