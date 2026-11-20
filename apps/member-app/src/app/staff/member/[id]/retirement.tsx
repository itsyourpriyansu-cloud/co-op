// D-131: the Super Admin proposes a corrected date of retirement; the Accountant, the Secretary and
// the President then approve it in turn from the member's profile.
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate } from '@tgs/domain';
import type { MemberDetail } from '@tgs/types';
import { ActionAlert, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, DateField, Header, Screen, Text, TextField } from '@/ui';

export default function RetirementChange() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id) });
  return (
    <Loaded page q={q} what="this member">
      {(d) => <Form d={d} />}
    </Loaded>
  );
}

function Form({ d }: { d: MemberDetail }) {
  const m = d.member;
  const [newDor, setNewDor] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const a = useAction();

  if (done)
    return (
      <Screen header={<Header title="Date of retirement" />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert heading="Sent for approval" description="The Accountant approves first, then the Secretary and the President. The date changes after the President approves." />
      </Screen>
    );

  return (
    <Screen
      header={<Header title="Date of retirement" onBack={() => router.back()} />}
      footer={<Button text="Send for approval" size="lg" fullWidth disabled={!newDor || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void a.run(() => api.members.proposeRetirementChange(m.id, { newDor, reason: reason.trim() }), () => setDone(true))} />}
    >
      <Text role="body" tone="secondary">
        {m.name} · now {formatDisplayDate(m.dor)}
      </Text>
      {d.dorWarning ? <Alert type="warning" heading="Expected date" description={d.dorWarning} /> : null}
      <DateField label="New date of retirement" required value={newDor} onChange={(x) => setNewDor(x ?? '')} error={a.fields.newDor} />
      <TextField label="Reason" required value={reason} onChangeText={setReason} placeholder="e.g. Service register entry, G.O. reference" multiline numberOfLines={3} error={a.fields.reason} />
      <Text role="caption" tone="tertiary">
        The date changes only after the Accountant, the Secretary and the President have each approved.
      </Text>
      <ActionAlert action={a} heading="Not sent" check={{ text: 'Check the member', href: `/staff/member/${m.id}` }} />
    </Screen>
  );
}
