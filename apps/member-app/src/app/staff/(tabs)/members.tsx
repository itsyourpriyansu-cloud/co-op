// ST-10m Member index: searched and filtered on the server, a page at a time. DDOs see their department.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FileClock, UserPlus, Users } from 'lucide-react-native';
import { formatDisplayDate, formatDuration, formatINR } from '@tgs/domain';
import type { MemberListParams, MemberRow, MemberStatus } from '@tgs/types';
import { Expand, Loaded, RecordCard, Row, ShareCsvButton, Stack2, StatTile, TileGrid, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { retiringLabel } from '@/lib/staffMembers';
import { Button, Card, Checkbox, EmptyState, Screen, SelectField, StatusTag, Tag, Text, TextField } from '@/ui';
import { space } from '@/theme';

const STATUS = [
  { label: 'Active members', value: 'ACTIVE' },
  { label: 'Retired', value: 'RETIRED' },
  { label: 'Resigned', value: 'RESIGNED' },
  { label: 'Deceased', value: 'DECEASED' },
  { label: 'Everyone', value: 'ALL' },
];
const RETIRING = [
  { label: 'Any retirement date', value: '' },
  { label: 'Within 3 months', value: '3' },
  { label: 'Within 6 months', value: '6' },
  { label: 'Within 12 months', value: '12' },
];

async function csvRows(params: MemberListParams) {
  const all: MemberRow[] = [];
  for (let p = 1; ; p++) {
    const res = await api.members.list({ ...params, page: p, pageSize: 100 });
    all.push(...res.items);
    if (all.length >= res.total || !res.items.length) break;
  }
  return [['General No.', 'Name', 'Employee ID', 'Department', 'Designation', 'Mobile', 'Date of retirement', 'Left-over service', 'Shares', 'Active loans', 'Outstanding', 'Status'], ...all.map((r) => [r.generalNo, r.name, r.employeeId, r.departmentName, r.designation, r.mobileMasked, formatDisplayDate(r.dor), formatDuration(r.leftoverMonths), r.numberOfShares, r.activeLoans, formatINR(r.outstanding), r.status])];
}

export default function Members() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const [status, setStatus] = useState<MemberStatus | 'ALL'>('ACTIVE');
  const [dept, setDept] = useState('');
  const [retiring, setRetiring] = useState('');
  const [loanOnly, setLoanOnly] = useState(false);
  const [mandateOnly, setMandateOnly] = useState(false);
  const params: MemberListParams = { q: q || undefined, status, departmentId: dept || undefined, retiringWithinMonths: retiring ? Number(retiring) : undefined, hasActiveLoan: loanOnly, mandatePending: mandateOnly };
  const list = useInfiniteQuery({
    queryKey: ['members', params],
    queryFn: ({ pageParam }) => api.members.list({ ...params, page: pageParam, pageSize: 25 }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (pages.reduce((n, p) => n + p.items.length, 0) < last.total ? pages.length + 1 : undefined),
  });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const filtersOn = Boolean(text || dept || retiring || loanOnly || mandateOnly || status !== 'ACTIVE');
  const clear = () => (setText(''), setDept(''), setRetiring(''), setLoanOnly(false), setMandateOnly(false), setStatus('ACTIVE'));

  return (
    <Screen refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">Members</Text>
          <Text role="caption" tone="secondary">
            {first ? `${first.total.toLocaleString('en-IN')} found${first.scope.departmentName ? ` · ${first.scope.departmentName} only` : ''}` : 'The member master'}
          </Text>
        </View>
        {first?.canCreate ? <Button text="New" size="sm" leftSlot={UserPlus} onPress={() => router.push('/staff/member/new')} /> : null}
      </View>

      <TileGrid>
        <StatTile label="Active members" value={(first?.counts.active ?? 0).toLocaleString('en-IN')} sub={`${(first?.counts.all ?? 0).toLocaleString('en-IN')} on the register`} />
        <StatTile label="Retiring in 6 months" value={String(first?.counts.retiringSoon ?? 0)} />
        <StatTile label="Mandate pending" value={String(first?.counts.mandatePending ?? 0)} tone={first?.counts.mandatePending ? 'warning' : 'neutral'} />
      </TileGrid>

      <Card padded={false}>
        <Row icon={FileClock} label="Change requests" hint="Profile changes from the app" right={first?.counts.changeRequests ? <Tag text={String(first.counts.changeRequests)} color="warning" size="xs" /> : undefined} onPress={() => router.push('/staff/change-requests')} />
      </Card>

      <TextField label="Search" value={text} onChangeText={setText} placeholder="Name, General No. or Employee ID" autoCorrect={false} />
      <SelectField label="Status" value={status} options={STATUS} onChange={(v) => setStatus(v as MemberStatus | 'ALL')} />
      <Expand title="More filters">
        {!first?.scope.departmentId ? <SelectField label="Department" searchable value={dept} options={[{ value: '', label: 'All departments' }, ...(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} onChange={setDept} /> : null}
        <SelectField label="Retirement" value={retiring} options={RETIRING} onChange={setRetiring} />
        <Checkbox checked={loanOnly} onChange={setLoanOnly} label="Has an active loan" />
        <Checkbox checked={mandateOnly} onChange={setMandateOnly} label="Mandate pending" />
        {filtersOn ? <Button text="Clear filters" subType="inline" onPress={clear} /> : null}
      </Expand>

      <Loaded q={list} what="members">
        {(d) =>
          !d.pages[0]?.counts.all ? (
            <EmptyState icon={Users} title="No members yet" description="Add a member, or approve a joining application to create one." />
          ) : !items.length ? (
            <EmptyState icon={Users} title="No members match" action={{ text: 'Clear filters', onPress: clear }} />
          ) : (
            <Stack2>
              {items.map((r) => {
                const soon = retiringLabel(r.leftoverMonths, r.status);
                return (
                  <RecordCard key={r.id} title={r.name} subtitle={`No. ${r.generalNo} · ${r.employeeId}`} amount={r.activeLoans ? formatINR(r.outstanding) : 'Non-loanee'} tag={<StatusTag entity="member" status={r.status} audience="staff" size="xs" />} caption={`${r.departmentName} · ${r.designation}`} onPress={() => router.push(`/staff/member/${r.id}`)}>
                    {soon || r.mandateStatus === 'PENDING_NEW_DDO' || r.pendingChanges > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                        {soon ? <Tag text={soon} color="warning" size="xs" /> : null}
                        {r.mandateStatus === 'PENDING_NEW_DDO' ? <Tag text="Mandate pending" color="warning" size="xs" /> : null}
                        {r.pendingChanges > 0 ? <Tag text="Change requested" color="primary" size="xs" /> : null}
                      </View>
                    ) : null}
                  </RecordCard>
                );
              })}
              {list.hasNextPage ? <Button text="Load more" buttonType="secondary" fullWidth loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
              <ShareCsvButton title="Members" rows={() => csvRows(params)} />
            </Stack2>
          )
        }
      </Loaded>
    </Screen>
  );
}
