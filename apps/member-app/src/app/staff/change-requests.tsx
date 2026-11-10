// ST-18m Profile change requests from the app. Employment and pay changes go to the DDO first.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileClock } from 'lucide-react-native';
import { formatDisplayDateTime } from '@tgs/domain';
import { Filter, Loaded, RecordCard, Stack2 } from '@/components/staff';
import { api } from '@/lib/api';
import { changeValue, fieldLabel } from '@/lib/staffMembers';
import { EmptyState, Header, Screen, StatusTag, Tag, Text, TextField } from '@/ui';
import { space } from '@/theme';

type Show = 'mine' | 'pending' | 'decided';

export default function ChangeRequests() {
  const list = useQuery({ queryKey: ['change-requests'], queryFn: api.changeRequests.list, refetchInterval: 20_000 });
  const [show, setShow] = useState<Show>('pending');
  const [q, setQ] = useState('');
  const data = list.data;
  const needle = q.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => (show === 'mine' ? Boolean(r.myAction) && r.status === 'PENDING' : show === 'pending' ? r.status === 'PENDING' : r.status !== 'PENDING') && (!needle || r.memberName.toLowerCase().includes(needle) || r.generalNo.includes(needle)));

  return (
    <Screen header={<Header title="Change requests" onBack={() => router.back()} />} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <Filter value={show} options={[{ value: 'mine', label: `On me ${data?.counts.waitingOnMe ?? 0}` }, { value: 'pending', label: `Pending ${data?.counts.pending ?? 0}` }, { value: 'decided', label: 'Decided' }]} onChange={setShow} />
      <TextField label="Search" value={q} onChangeText={setQ} placeholder="Member or General No." autoCorrect={false} />
      <Loaded q={list} what="change requests">
        {(d) =>
          !d.rows.length ? (
            <EmptyState icon={FileClock} title="No change requests" description="When a member asks to correct their details in the app, it appears here." />
          ) : !rows.length ? (
            <EmptyState icon={FileClock} title="Nothing here" description="Try another filter." />
          ) : (
            <Stack2>
              {rows.map((r) => (
                <RecordCard key={r.id} title={r.memberName} subtitle={`No. ${r.generalNo} · ${r.departmentName}`} tag={<StatusTag entity="changeRequest" status={r.status} audience="staff" size="xs" />} caption={`${r.route === 'DDO_THEN_OFFICE' ? (r.ddoCertified ? 'DDO certified' : 'Needs the DDO first') : 'Office only'}${r.status === 'PENDING' ? (r.waitingOn ? ` · waiting on ${r.waitingOn}` : '') : ` · ${formatDisplayDateTime(r.decidedAt ?? r.createdAt)}`}`} onPress={() => router.push(`/staff/change-request/${r.id}`)}>
                  <View style={{ gap: space[1] }}>
                    {r.fields.map((f) => (
                      <Text key={f.field} role="caption" tone="secondary">
                        {fieldLabel(f)}: {changeValue(f, f.oldValue)} → {changeValue(f, f.newValue)}
                      </Text>
                    ))}
                  </View>
                  {r.myAction ? <Tag text={r.myAction === 'certify' ? 'Certify' : 'Decide'} color="primary" type="attentive" size="xs" /> : null}
                </RecordCard>
              ))}
            </Stack2>
          )
        }
      </Loaded>
    </Screen>
  );
}
