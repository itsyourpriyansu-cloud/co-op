// ST-18m One change request: what changes, who decides, approve or reject with a reason.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDateTime } from '@tgs/domain';
import type { ChangeRequestRow } from '@tgs/types';
import { ActionAlert, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { changeValue, fieldLabel } from '@/lib/staffMembers';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, StatusTag, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function ChangeRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useQuery({ queryKey: ['change-requests'], queryFn: api.changeRequests.list });
  const [row, setRow] = useState<ChangeRequestRow>();
  return (
    <Loaded page q={list} what="this request">
      {(d) => {
        const r = row ?? d.rows.find((x) => x.id === id);
        return r ? (
          <Decide r={r} onSaved={setRow} />
        ) : (
          <Screen header={<Header title="Change request" onBack={() => router.back()} />}>
            <Alert type="neutral" heading="Not found" description="This request may have been removed." />
          </Screen>
        );
      }}
    </Loaded>
  );
}

function Decide({ r, onSaved }: { r: ChangeRequestRow; onSaved: (r: ChangeRequestRow) => void }) {
  const a = useAction();
  const [remarks, setRemarks] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [done, setDone] = useState<string>();
  const certifying = r.myAction === 'certify';
  const canAct = Boolean(r.myAction) && r.status === 'PENDING';

  const act = (approve: boolean) =>
    void a.run(async () => {
      const next = certifying ? await api.changeRequests.certify(r.id, approve, remarks.trim() || undefined) : await api.changeRequests.decide(r.id, approve, remarks.trim() || undefined);
      onSaved(next);
      setDone(certifying ? (approve ? 'Certified. Sent to the Accountant' : 'Not certified. Member told why') : approve ? 'Approved. Profile updated' : 'Rejected. Member told why');
    });

  const footer = done ? (
    <Button text="Done" size="lg" fullWidth onPress={() => router.back()} />
  ) : !canAct ? undefined : rejecting ? (
    <View style={{ gap: space[3] }}>
      <Button text={certifying ? 'Do not certify' : 'Reject request'} buttonType="danger" size="lg" fullWidth disabled={!remarks.trim() || a.busy} loading={a.busy} onPress={() => act(false)} />
      <Button text="Back" buttonType="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(false)} />
    </View>
  ) : (
    <View style={{ gap: space[3] }}>
      <Button text={certifying ? 'Certify' : 'Approve & update profile'} size="lg" fullWidth loading={a.busy} disabled={a.busy} onPress={() => act(true)} />
      <Button text={certifying ? 'Not correct' : 'Reject'} buttonType="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(true)} />
    </View>
  );

  return (
    <Screen header={<Header title={certifying ? 'Certify details' : 'Change request'} onBack={() => router.back()} />} {...(footer ? { footer } : {})}>
      {done ? <DoneAlert heading={done} description={`${r.memberName} · General No. ${r.generalNo}`} /> : null}
      <View style={{ gap: space[2] }}>
        <Text role="pageTitle">{r.memberName}</Text>
        <Text role="caption" tone="secondary">
          General No. {r.generalNo} · {r.departmentName}
        </Text>
        <StatusTag entity="changeRequest" status={r.status} audience="staff" />
      </View>
      <Section title="What changes">
        <Card>
          {r.fields.map((f) => (
            <View key={f.field} style={{ gap: space[1], paddingVertical: space[2] }}>
              <Text role="caption" tone="tertiary">
                {fieldLabel(f)}
              </Text>
              <Text role="body" tone="secondary" style={{ textDecorationLine: 'line-through' }}>
                {changeValue(f, f.oldValue)}
              </Text>
              <Text role="bodyStrong">{changeValue(f, f.newValue)}</Text>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Member's reason">
        <Text role="body">“{r.reason}”</Text>
        <Text role="caption" tone="tertiary">
          Sent from the app · {formatDisplayDateTime(r.createdAt)}
        </Text>
      </Section>
      {r.documentName ? (
        <Card>
          <KeyValue label="Supporting document" value={r.documentName} />
        </Card>
      ) : null}
      <Section title="Route">
        <Card>
          {r.route === 'DDO_THEN_OFFICE' ? <KeyValue label="DDO certifies" value={r.ddoCertified ? `${r.ddoCertified.byName} · ${formatDisplayDateTime(r.ddoCertified.at)}` : 'Pending'} /> : null}
          <KeyValue label="Accountant decides" value={r.decidedByName ? `${r.decidedByName}${r.decidedAt ? ` · ${formatDisplayDateTime(r.decidedAt)}` : ''}` : 'Pending'} />
        </Card>
      </Section>
      {r.remarks ? <Alert type={r.status === 'REJECTED' ? 'error' : 'neutral'} heading="Remarks" description={r.remarks} /> : null}
      {canAct && !certifying && !done ? (
        <Text role="caption" tone="secondary">
          Approving writes the new values to the member master, adds a service-history entry and tells the member in the app.
        </Text>
      ) : null}
      {canAct && rejecting && !done ? <TextField label="Reason (the member sees this)" required value={remarks} onChangeText={setRemarks} placeholder="e.g. Send the service register extract" multiline numberOfLines={3} error={a.fields.remarks} /> : null}
      {!canAct && r.status === 'PENDING' && r.waitingOn ? (
        <Text role="body" tone="secondary">
          Waiting on {r.waitingOn}.
        </Text>
      ) : null}
      <ActionAlert action={a} heading="Not saved" />
      <Button text="Open member profile" subType="inline" onPress={() => router.push(`/staff/member/${r.memberId}`)} />
    </Screen>
  );
}
