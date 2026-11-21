// ST-18m One change request: what changes, who decides, approve or reject with a reason.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDateTime } from '@tgs/domain';
import type { ChangeRequestRow } from '@tgs/types';
import { ActionAlert, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { FileButton } from '@/components/FileButton';
import { changeValue, fieldLabel } from '@/lib/staffMembers';
import { Banner, Button, Card, Header, MetadataListItem, Screen, Section, StatusToken, Text, TextField, Link } from '@/ui';
import { spacing } from '@/theme';

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
            <Banner status="neutral" heading="Not found" description="This request may have been removed." />
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
    <Button label="Done" size="lg" fullWidth onPress={() => router.back()} />
  ) : !canAct ? undefined : rejecting ? (
    <View style={{ gap: spacing[1.5] }}>
      <Button label={certifying ? 'Do not certify' : 'Reject request'} variant="destructive" size="lg" fullWidth disabled={!remarks.trim() || a.busy} loading={a.busy} onPress={() => act(false)} />
      <Button label="Back" variant="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(false)} />
    </View>
  ) : (
    <View style={{ gap: spacing[1.5] }}>
      <Button label={certifying ? 'Certify' : 'Approve & update profile'} size="lg" fullWidth loading={a.busy} disabled={a.busy} onPress={() => act(true)} />
      <Button label={certifying ? 'Not correct' : 'Reject'} variant="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(true)} />
    </View>
  );

  return (
    <Screen header={<Header title={certifying ? 'Certify details' : 'Change request'} onBack={() => router.back()} />} {...(footer ? { footer } : {})}>
      {done ? <DoneAlert heading={done} description={`${r.memberName} · General No. ${r.generalNo}`} /> : null}
      <View style={{ gap: spacing[1] }}>
        <Text type="h1">{r.memberName}</Text>
        <Text type="supporting" tone="secondary">
          General No. {r.generalNo} · {r.departmentName}
        </Text>
        <StatusToken entity="changeRequest" status={r.status} audience="staff" />
      </View>
      <Section title="What changes">
        <Card>
          {r.fields.map((f) => (
            <View key={f.field} style={{ gap: spacing[0.5], paddingVertical: spacing[1] }}>
              <Text type="supporting" tone="secondary">
                {fieldLabel(f)}
              </Text>
              <Text type="body" tone="secondary" style={{ textDecorationLine: 'line-through' }}>
                {changeValue(f, f.oldValue)}
              </Text>
              <Text type="body" weight="medium">{changeValue(f, f.newValue)}</Text>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Member's reason">
        <Text type="body">“{r.reason}”</Text>
        <Text type="supporting" tone="secondary">
          Sent from the app · {formatDisplayDateTime(r.createdAt)}
        </Text>
      </Section>
      {r.documentName ? (
        <Card>
          <MetadataListItem label="Supporting document" value={r.documentName} />
          {r.documentFileId ? <FileButton fileId={r.documentFileId} consolePath="/members/change-requests" /> : null}
        </Card>
      ) : null}
      <Section title="Route">
        <Card>
          {r.route === 'DDO_THEN_OFFICE' ? <MetadataListItem label="DDO certifies" value={r.ddoCertified ? `${r.ddoCertified.byName} · ${formatDisplayDateTime(r.ddoCertified.at)}` : 'Pending'} /> : null}
          <MetadataListItem label="Accountant decides" value={r.decidedByName ? `${r.decidedByName}${r.decidedAt ? ` · ${formatDisplayDateTime(r.decidedAt)}` : ''}` : 'Pending'} />
        </Card>
      </Section>
      {r.remarks ? <Banner status={r.status === 'REJECTED' ? 'error' : 'neutral'} heading="Remarks" description={r.remarks} /> : null}
      {canAct && !certifying && !done ? (
        <Text type="supporting" tone="secondary">
          Approving writes the new values to the member master, adds a service-history entry and tells the member in the app.
        </Text>
      ) : null}
      {canAct && rejecting && !done ? <TextField label="Reason (the member sees this)" required value={remarks} onChangeText={setRemarks} placeholder="e.g. Send the service register extract" multiline numberOfLines={3} error={a.fields.remarks} /> : null}
      {!canAct && r.status === 'PENDING' && r.waitingOn ? (
        <Text type="body" tone="secondary">
          Waiting on {r.waitingOn}.
        </Text>
      ) : null}
      <ActionAlert action={a} heading="Not saved" />
      <Link label="Open member profile" onPress={() => router.push(`/staff/member/${r.memberId}`)} />
    </Screen>
  );
}
