// ST-14m Joining: membership applications from the app. The console's stage board becomes a stage picker.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react-native';
import type { MembershipRow } from '@tgs/types';
import { FilterBar, Loaded, RecordCard, Stack2, StatTile, TileGrid } from '@/components/staff';
import { api } from '@/lib/api';
import { FLAG_LABEL, STAGES } from '@/lib/staffJoining';
import { EmptyState, Screen, SelectField, StatusTag, Tag, Text, TextField } from '@/ui';
import { space } from '@/theme';

function waiting(r: MembershipRow) {
  if (r.waitingOnMe) return 'Waiting on you';
  return r.waitingOn ? `Waiting on ${r.waitingOn}` : r.allottedGeneralNo ? `General No. ${r.allottedGeneralNo}` : undefined;
}

export default function Joining() {
  const list = useQuery({ queryKey: ['membership-applications'], queryFn: api.applications.list, refetchInterval: 20_000 });
  const [stage, setStage] = useState('ALL');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [mine, setMine] = useState(false);
  const data = list.data;
  const departments = useMemo(() => [...new Map((data?.rows ?? []).map((r) => [r.departmentId, r.departmentName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const count = (s: string) => (data?.rows ?? []).filter((r) => r.status === s).length;
  const needle = q.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => (stage === 'ALL' || (stage === 'DECIDED' ? ['ACTIVE', 'REJECTED', 'WITHDRAWN'].includes(r.status) : r.status === stage)) && (!needle || r.name.toLowerCase().includes(needle) || r.applicationNo.toLowerCase().includes(needle)) && (!dept || r.departmentId === dept) && (!mine || r.waitingOnMe));
  const inFlight = (data?.rows ?? []).filter((r) => !['ACTIVE', 'REJECTED', 'WITHDRAWN'].includes(r.status)).length;
  const filtersOn = Boolean(needle || dept || mine || stage !== 'ALL');

  return (
    <Screen refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <View style={{ gap: space[1] }}>
        <Text role="pageTitle">Joining</Text>
        <Text role="caption" tone="secondary">
          Applications from the app{data?.scope.departmentName ? ` · ${data.scope.departmentName} only` : ''}
        </Text>
      </View>
      <TileGrid>
        <StatTile label="In progress" value={String(inFlight)} />
        <StatTile label="Waiting on you" value={String(data?.waitingOnMe ?? 0)} tone={data?.waitingOnMe ? 'warning' : 'neutral'} />
        <StatTile label="With applicants" value={String(data?.counts.INFO_REQUESTED ?? 0)} />
        <StatTile label="New members" value={String(data?.counts.ACTIVE ?? 0)} />
      </TileGrid>
      <FilterBar search={<TextField compact label="Search" value={q} onChangeText={setQ} placeholder="Name or application no." autoCorrect={false} />}>
        <SelectField compact label="Show" value={stage} options={[{ value: 'ALL', label: 'All stages' }, ...STAGES.map((s) => ({ value: s.status, label: `${s.title} (${count(s.status)})` })), { value: 'DECIDED', label: 'Decided' }]} onChange={setStage} />
        {!data?.scope.departmentId ? <SelectField compact label="Department" searchable value={dept} options={[{ value: '', label: 'All departments' }, ...departments.map(([value, label]) => ({ value, label }))]} onChange={setDept} /> : null}
        <SelectField compact label="Waiting on" value={mine ? 'me' : ''} options={[{ value: '', label: 'Waiting on anyone' }, { value: 'me', label: 'Waiting on me' }]} onChange={(v) => setMine(v === 'me')} />
      </FilterBar>
      <Loaded q={list} what="applications">
        {(d) =>
          !d.rows.length ? (
            <EmptyState icon={UserPlus} title="No applications yet" description="Applications submitted in the app appear here within a few seconds." />
          ) : !rows.length ? (
            <EmptyState icon={UserPlus} title="No applications match" action={filtersOn ? { text: 'Clear filters', onPress: () => (setQ(''), setDept(''), setMine(false), setStage('ALL')) } : undefined} />
          ) : (
            <Stack2>
              {rows.map((r) => {
                const flags = r.flags.filter((f) => f !== 'RETURNED');
                return (
                  <RecordCard key={r.id} title={r.name} subtitle={`${r.applicationNo} · ${r.designation}`} tag={<StatusTag entity="membership" status={r.status} audience="staff" size="xs" />} onPress={() => router.push(`/staff/joining/${r.id}`)} caption={[r.departmentName, waiting(r)].filter(Boolean).join(' · ')}>
                    {flags.length ? <Tag text={flags.map((f) => FLAG_LABEL[f]).join(', ')} color="warning" size="xs" /> : null}
                    {r.status !== 'ACTIVE' && r.status !== 'REJECTED' ? <Tag text={r.daysInStage === 0 ? 'In stage today' : `In stage ${r.daysInStage} day${r.daysInStage === 1 ? '' : 's'}`} color={r.daysInStage > 10 ? 'error' : r.daysInStage > 5 ? 'warning' : 'neutral'} size="xs" /> : null}
                  </RecordCard>
                );
              })}
            </Stack2>
          )
        }
      </Loaded>
    </Screen>
  );
}
