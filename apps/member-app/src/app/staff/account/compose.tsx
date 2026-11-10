// ST-03m Composer: channel, recipients, template, preview, send. Delivery is simulated (D-074).
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { ComposeInput, ComposePreview, MemberPick, MessageAudience, MessageChannel } from '@tgs/types';
import { ActionAlert, Filter, MemberPicker, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, Card, Header, Screen, Section, SelectField, Text, TextField } from '@/ui';
import { space } from '@/theme';

type Kind = MessageAudience['kind'];

export default function Compose() {
  const templates = useQuery({ queryKey: ['notification-templates'], queryFn: api.settings.templates });
  const departments = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments });
  const [channel, setChannel] = useState<MessageChannel>('WHATSAPP');
  const [kind, setKind] = useState<Kind>('DEFAULTERS');
  const [member, setMember] = useState<MemberPick>();
  const [departmentId, setDepartmentId] = useState('');
  const [within, setWithin] = useState('6');
  const [templateKey, setTemplateKey] = useState('');
  const [title, setTitle] = useState('Dues reminder');
  const [body, setBody] = useState('Dear {name} (General No. {generalNo}), {overdue} is unpaid on your society account. Please pay at the counter or by bank transfer and report it in the app.');
  const [preview, setPreview] = useState<ComposePreview>();
  const [audienceError, setAudienceError] = useState<string>();
  const a = useAction();

  const usable = (templates.data ?? []).filter((t) => t.audience === 'MEMBER' && ['dues.reminder', 'defaulter.notice', 'fd.maturing', 'recovery.short'].includes(t.key));
  const audience: MessageAudience | undefined = kind === 'MEMBER' ? (member ? { kind, memberId: member.id } : undefined) : kind === 'DEPARTMENT' ? (departmentId ? { kind, departmentId } : undefined) : kind === 'RETIRING' ? { kind, withinMonths: Number(within) || 6 } : { kind: 'DEFAULTERS' };
  const input = (): ComposeInput | undefined => (audience ? { channel, audience, title, body, ...(templateKey ? { templateKey } : {}) } : undefined);
  const reset = () => (setPreview(undefined), setAudienceError(undefined));

  const doPreview = async () => {
    const i = input();
    if (!i) return setAudienceError(kind === 'MEMBER' ? 'Choose a member' : 'Choose a department');
    await a.run(async () => setPreview(await api.notifications.preview(i)));
  };
  const send = () => {
    const i = input();
    if (i) void a.run(() => api.notifications.send(i), () => router.back());
  };

  return (
    <Screen
      header={<Header title="Send a message" onBack={() => router.back()} />}
      footer={
        <View style={{ gap: space[3] }}>
          <Text role="caption" tone="tertiary">
            {preview ? `${preview.recipients} recipient${preview.recipients === 1 ? '' : 's'}${preview.skipped ? ` · ${preview.skipped} without ${channel === 'EMAIL' ? 'an email' : 'a number'}` : ''}` : 'Preview first to see who gets it'}
          </Text>
          {preview ? <Button text="Send" size="lg" fullWidth loading={a.busy} disabled={!preview.recipients || a.busy} onPress={send} /> : <Button text="Preview" size="lg" fullWidth loading={a.busy} onPress={() => void doPreview()} />}
        </View>
      }
    >
      <Text role="body" tone="secondary">
        Simulated: nothing leaves the society server. Members also get it in the app.
      </Text>
      <Filter label="Channel" value={channel} options={[{ value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'EMAIL', label: 'Email' }]} onChange={(c) => (setChannel(c), reset())} />
      <SelectField label="To" value={kind} options={[{ value: 'DEFAULTERS', label: 'All defaulters' }, { value: 'DEPARTMENT', label: 'A department' }, { value: 'RETIRING', label: 'Retiring soon' }, { value: 'MEMBER', label: 'One member' }]} onChange={(k) => (setKind(k as Kind), reset())} />
      {kind === 'MEMBER' ? <MemberPicker {...(member ? { value: member } : {})} onPick={(m) => (setMember(m), reset())} {...(audienceError ? { error: audienceError } : {})} /> : null}
      {kind === 'DEPARTMENT' ? <SelectField label="Department" searchable value={departmentId} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name, hint: `${d.memberCount} members` }))} onChange={(id) => (setDepartmentId(id), reset())} {...(audienceError ? { error: audienceError } : {})} /> : null}
      {kind === 'RETIRING' ? <Filter label="Within" value={within} options={['3', '6', '12'].map((n) => ({ value: n, label: `${n} months` }))} onChange={(n) => (setWithin(n), reset())} /> : null}
      {usable.length ? (
        <SelectField
          label="Start from a template"
          value={templateKey}
          options={usable.map((t) => ({ value: t.key, label: t.event.replace(/ \(.*\)$/, '') }))}
          onChange={(k) => {
            const t = usable.find((x) => x.key === k);
            setTemplateKey(k);
            if (t) (setTitle(t.title), setBody(t.body));
            reset();
          }}
        />
      ) : null}
      <TextField label={channel === 'EMAIL' ? 'Subject' : 'Title'} value={title} onChangeText={(v) => (setTitle(v), reset())} error={a.fields.title} />
      <TextField label="Message" value={body} onChangeText={(v) => (setBody(v), reset())} multiline numberOfLines={5} error={a.fields.body} hint="Placeholders: {name} {generalNo} {department} {overdue} {cycle} {dor}" />
      <ActionAlert action={a} heading="Not sent" />
      {preview ? (
        <Section title={`${preview.audienceLabel} · ${preview.recipients} recipient${preview.recipients === 1 ? '' : 's'}`}>
          <View style={{ gap: space[4] }}>
            {preview.sample.map((s) => (
              <Card key={s.memberId}>
                <View style={{ gap: space[1] }}>
                  <Text role="caption" tone="tertiary">
                    To {s.name} ({s.generalNo}) · {s.to}
                  </Text>
                  <Text role="label">{s.title}</Text>
                  <Text role="body">{s.body}</Text>
                </View>
              </Card>
            ))}
            {preview.recipients > preview.sample.length ? (
              <Text role="caption" tone="tertiary">
                …and {preview.recipients - preview.sample.length} more.
              </Text>
            ) : null}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
