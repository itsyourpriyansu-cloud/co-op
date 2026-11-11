// ST-13m Department transfer (J-11, BR-010, BR-028).
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatCycle, toCycle } from '@tgs/domain';
import type { MemberDetail } from '@tgs/types';
import { ActionAlert, ask, DoneAlert, Loaded, useAction, useTodayDate } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, DateField, Header, Screen, SelectField, Text, TextField } from '@/ui';

const safeCycle = (date: string) => {
  try {
    return formatCycle(toCycle(date));
  } catch {
    return 'next';
  }
};

export default function Transfer() {
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
  const { today, date, setDate } = useTodayDate();
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const [to, setTo] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [done, setDone] = useState<{ heading: string; description?: string }>();
  const a = useAction();
  const target = depts.data?.find((x) => x.id === to);

  const save = async () => {
    if (!date || !(await ask('Confirm transfer', `${m.name} moves to ${target?.name ?? ''}.`, 'Transfer'))) return;
    await a.run(async () => {
      const next = await api.members.transfer(m.id, { toDepartmentId: to, effectiveDate: date, ...(orderRef.trim() ? { orderRef: orderRef.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) });
      const cycle = next.upcomingTransfer?.effectiveCycle ?? next.serviceEvents[0]?.effectiveCycle;
      setDone({ heading: `Transferred to ${next.department?.name ?? ''}`, ...(cycle ? { description: `On their demand sheet from ${formatCycle(cycle)}. The new DDO must agree the mandate.` } : {}) });
    });
  };

  if (done)
    return (
      <Screen header={<Header title="Transfer" />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert {...done} />
      </Screen>
    );

  return (
    <Screen header={<Header title="Transfer" onBack={() => router.back()} />} footer={<Button text="Confirm transfer" size="lg" fullWidth disabled={!to || !date || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />}>
      <Text role="body" tone="secondary">
        {m.name} · now in {d.department?.name}
      </Text>
      <SelectField
        label="New department"
        required
        searchable
        placeholder="Choose department"
        value={to}
        options={(depts.data ?? []).filter((x) => x.id !== m.departmentId).map((x) => ({ value: x.id, label: x.name, hint: `DDO ${x.ddoName}${x.kind === 'EXTERNAL_OFFICE' ? ' · outside the Secretariat' : ''}` }))}
        onChange={setTo}
        error={a.fields.toDepartmentId}
      />
      <DateField key={today} label="Effective date" required value={date} onChange={setDate} hint="The date in the transfer order" error={a.fields.effectiveDate} />
      <TextField label="Order reference" value={orderRef} onChangeText={setOrderRef} placeholder="e.g. GAD/TR/2026/0123" hint="Optional" />
      <TextField label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Optional" multiline numberOfLines={2} />
      {target && date ? <Alert type="primary" heading={`On ${target.name}'s sheet from ${safeCycle(date)}`} description={`Or the next one if ${d.department?.name}'s ${safeCycle(date)} sheet is already generated. ${target.ddoName} (DDO) must then agree the salary recovery mandate. Until then new loans show a warning.`} /> : null}
      <ActionAlert action={a} heading="Not transferred" check={{ text: 'Check the member', href: `/staff/member/${m.id}` }} />
    </Screen>
  );
}
