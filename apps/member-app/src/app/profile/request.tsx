// MB-19 Request a change (D-044, D-057): the member picks what is wrong, types the correct value,
// says why and attaches proof. Employment and pay details go to their DDO first, then the office.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Paperclip, Send } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { changeRequestRoute, formatDisplayDate, formatINR, NOMINEE_RELATIONS, PROFILE_FIELDS, profileFieldValue } from '@tgs/domain';
import type { ProfileField } from '@tgs/types';
import { useMyProfile, useRequestChange } from '@/lib/profile';
import { Alert, Button, Card, Checkbox, DateField, Header, Screen, Section, SelectField, Text, TextField } from '@/ui';
import { space } from '@/theme';

const GROUPS: Array<{ title: string; fields: ProfileField[] }> = [
  { title: 'Personal', fields: ['name', 'fatherName', 'dob'] },
  { title: 'Employment', fields: ['designation', 'doj', 'dor'] },
  { title: 'Nominee', fields: ['nominee.name', 'nominee.relation'] },
  { title: 'Pay', fields: ['payProfile.scaleOfPay', 'payProfile.grossSalary'] },
];

export default function RequestChange() {
  const profile = useMyProfile();
  const send = useRequestChange();
  const p = profile.data;
  const [picked, setPicked] = useState<ProfileField[]>([]);
  const [values, setValues] = useState<Partial<Record<ProfileField, string>>>({});
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState<string>();

  const route = useMemo(() => (picked.length ? changeRequestRoute(picked) : undefined), [picked]);
  const errors = isApiError(send.error) ? (send.error.fieldErrors ?? {}) : {};
  const toggle = (f: ProfileField) => setPicked((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]));
  const current = (f: ProfileField) => {
    if (!p) return '';
    const v = profileFieldValue(p.member, f);
    const kind = PROFILE_FIELDS[f].kind;
    return kind === 'money' ? formatINR(Number(v) * 100) : kind === 'date' ? formatDisplayDate(v) : v;
  };

  if (send.isSuccess) {
    return (
      <Screen header={<Header title="Request a change" onBack={() => router.back()} />}>
        <Alert
          type="success"
          heading="Request sent"
          description={send.data.route === 'DDO_THEN_OFFICE' ? 'Your department (DDO) confirms the employment / pay details first, then the society office updates your profile.' : 'The society office will review it. You can follow it on your profile.'}
        />
        <Button text="Back to my profile" fullWidth onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header title="Request a change" onBack={() => router.back()} />}
      footer={
        <Button
          text="Send request"
          leftSlot={Send}
          size="lg"
          fullWidth
          disabled={!picked.length}
          loading={send.isPending}
          onPress={() => send.mutate({ fields: picked.map((field) => ({ field, newValue: values[field] ?? '' })), reason, ...(doc ? { documentName: doc } : {}) })}
        />
      }
    >
      <Text role="body" tone="secondary">
        Choose what is wrong in your records and give the correct value. The society checks it before your profile changes.
      </Text>
      {errors.fields ? <Alert type="error" heading={errors.fields} /> : null}
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card>
            <View style={{ gap: space[4] }}>
              {g.fields.map((f) => {
                const pending = p?.pendingFields.includes(f);
                const on = picked.includes(f);
                const meta = PROFILE_FIELDS[f];
                return (
                  <View key={f} style={{ gap: space[4] }}>
                    <Checkbox checked={on} onChange={() => !pending && toggle(f)} label={meta.label} description={pending ? 'A request is already pending' : `Now: ${current(f) || '—'}`} />
                    {on ? (
                      meta.kind === 'date' ? (
                        <DateField label={`Correct ${meta.label.toLowerCase()}`} value={values[f]} onChange={(v) => setValues((x) => ({ ...x, [f]: v ?? '' }))} error={errors[`fields.${f}`]} />
                      ) : meta.kind === 'relation' ? (
                        <SelectField label="Correct relation" value={values[f]} options={NOMINEE_RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => setValues((x) => ({ ...x, [f]: v }))} error={errors[`fields.${f}`]} />
                      ) : (
                        <TextField
                          label={`Correct ${meta.label.toLowerCase()}`}
                          value={values[f] ?? ''}
                          onChangeText={(v) => setValues((x) => ({ ...x, [f]: meta.kind === 'money' ? v.replace(/\D/g, '') : v }))}
                          {...(meta.kind === 'money' ? { prefix: '₹', keyboardType: 'number-pad' as const } : {})}
                          error={errors[`fields.${f}`]}
                        />
                      )
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        </Section>
      ))}

      {picked.length ? (
        <Section title="Why and proof">
          <Card>
            <View style={{ gap: space[8] }}>
              <TextField label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Promoted from 01 Oct 2026" error={errors.reason} required multiline />
              {/* Prototype: a file picker is simulated by attaching a named document. */}
              <Button text={doc ? `Attached: ${doc}` : 'Attach proof (order, ID, certificate)'} buttonType="secondary" leftSlot={Paperclip} fullWidth onPress={() => setDoc(doc ? undefined : 'supporting-document.pdf')} />
              {route === 'DDO_THEN_OFFICE' ? <Alert type="primary" heading="Your DDO confirms this first" description="Employment and pay details are checked by your department before the office updates them." /> : <Alert type="neutral" heading="The society office reviews this" />}
            </View>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
