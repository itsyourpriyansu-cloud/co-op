// ST-42m certify (BR-030) and send to the DDO.
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatCycle, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { ActionAlert, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { HEAD_COLUMNS } from '@/lib/staffCollections';
import { Button, Card, Header, KeyValue, Screen, Text, TextField } from '@/ui';

export default function SheetAction() {
  const { id, action } = useLocalSearchParams<{ id: string; action: 'certify' | 'sendToDdo' }>();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  return (
    <Loaded page q={q} what="this sheet">
      {(d) => <Decide d={d} action={action} />}
    </Loaded>
  );
}

function Decide({ d, action }: { d: DemandSheetDetail; action: 'certify' | 'sendToDdo' }) {
  const a = useAction();
  const [remarks, setRemarks] = useState('');
  const [done, setDone] = useState<string>();
  const certify = action === 'certify';
  const title = certify ? 'Certify the demand sheet' : 'Send to the DDO';
  const submit = () =>
    void a.run(async () => {
      await api.demand.act(d.sheet.id, action, remarks.trim() ? { remarks: remarks.trim() } : {});
      setDone(certify ? 'Certified correct' : 'Sent to the DDO');
    });

  if (done)
    return (
      <Screen header={<Header title={title} />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert heading={done} description={`${d.department?.name} · ${formatCycle(d.sheet.cycle)}`} />
      </Screen>
    );

  return (
    <Screen header={<Header title={title} onBack={() => router.back()} />} footer={<Button text={certify ? 'Certify correct' : 'Send'} size="lg" fullWidth loading={a.busy} disabled={a.busy || a.unconfirmed} onPress={submit} />}>
      <Text role="body" tone="secondary">
        {certify ? 'You confirm the demand is correct. Your name and the time are stamped on the sheet.' : `To ${d.department?.ddoName}, ${d.department?.ddoDesignation}, ${d.department?.name}. The DDO deducts these amounts from the salaries.`}
      </Text>
      <Card>
        <KeyValue label="Members" value={String(d.lines.length)} />
        <KeyValue label="Total demand" value={formatINR(d.totals.demand)} emphasis />
        {HEAD_COLUMNS.filter((h) => d.totals.heads[h.head]).map((h) => (
          <KeyValue key={h.head} label={h.label} value={formatINR(d.totals.heads[h.head] ?? 0)} />
        ))}
      </Card>
      <TextField label="Remarks (optional)" placeholder={certify ? 'e.g. Checked against the loan register.' : 'e.g. Please deduct from the October salary.'} value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} error={a.fields.remarks} />
      <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check the sheet', href: `/staff/demand/${d.sheet.id}` }} />
    </Screen>
  );
}
