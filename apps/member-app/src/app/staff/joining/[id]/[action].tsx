// ST-16m DDO certify, ST-17m approval and the other joining decisions, one pushed screen per drawer.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { amountInWords, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { F1_CERT_ITEMS, type F1CertItem, type MembershipAction, type MembershipActionInput, type MembershipDetail } from '@tgs/types';
import { ActionAlert, ask, DoneAlert, Loaded, RuleChecks, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { ACTION_LABEL, certItems, ITEM_FIELD, RETURN_FIELDS } from '@/lib/staffJoining';
import { Alert, Button, Card, Checkbox, ChoiceCard, Header, KeyValue, Screen, Section, Segmented, SelectField, Text, TextField } from '@/ui';
import { space } from '@/theme';

const TITLES: Record<MembershipAction, (d: MembershipDetail) => { title: string; description: string }> = {
  sendToDdo: (d) => ({ title: 'Intake check', description: `Confirm the application is complete, then send it to the ${d.department?.name ?? ''} DDO for certification.` }),
  certify: () => ({ title: 'Certify items 1 to 7', description: 'Check each item against the service register. Certifying adds your digital seal to the form.' }),
  forward: () => ({ title: 'Office review', description: 'Recommend the application to the Secretary. Your remarks travel with it.' }),
  approve: (d) => (d.application.status === 'APPROVAL_PRESIDENT' ? { title: 'Approve (2 of 2)', description: 'Final approval. Choose how the new member pays for the shares.' } : { title: 'Approve (1 of 2)', description: 'Your approval sends the application to the President.' }),
  recordSharePayment: () => ({ title: 'Record share payment', description: 'Receipt the share capital. The member record and General No. are created right away.' }),
  activate: () => ({ title: 'Activate membership', description: 'Shares will be recovered on the first demand sheet. The member record and General No. are created now.' }),
  returnToApplicant: () => ({ title: 'Return to applicant', description: 'The applicant sees your message in the app, corrects the form and signs again.' }),
  reject: () => ({ title: 'Reject application', description: 'This ends the application. The applicant sees your reason in the app.' }),
};

export default function ApplicationAction() {
  const { id, action } = useLocalSearchParams<{ id: string; action: MembershipAction }>();
  const q = useQuery({ queryKey: ['membership-application', id], queryFn: () => api.applications.get(id) });
  return (
    <Loaded q={q} what="this application">
      {(d) => <Decision d={d} action={action} />}
    </Loaded>
  );
}

function Decision({ d, action }: { d: MembershipDetail; action: MembershipAction }) {
  const app = d.application;
  const a = useAction();
  const [remarks, setRemarks] = useState(action === 'forward' ? 'Eligible. Recommended for admission.' : action === 'sendToDdo' ? 'Documents complete. Sent to the department for certification.' : '');
  const [field, setField] = useState(app.infoRequest?.field ?? '');
  const [items, setItems] = useState<Partial<Record<F1CertItem, 'OK' | 'FLAG'>>>({});
  const [mandate, setMandate] = useState(false);
  const [route, setRoute] = useState<'COUNTER' | 'FIRST_DEMAND' | ''>('');
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'CHEQUE'>('CASH');
  const [reference, setReference] = useState('');
  const [done, setDone] = useState<{ heading: string; description: string }>();

  const rows = certItems(app, d.department?.name ?? '');
  const flagged = F1_CERT_ITEMS.filter((i) => items[i] === 'FLAG');
  const allConfirmed = F1_CERT_ITEMS.every((i) => items[i] === 'OK');
  const finalApproval = action === 'approve' && app.status === 'APPROVAL_PRESIDENT';
  const { title, description } = TITLES[action](d);

  const primaryText = action === 'certify' && flagged.length ? `Return with ${flagged.length} to correct` : action === 'sendToDdo' ? `Send to ${d.department?.ddoName ?? 'the DDO'}` : action === 'recordSharePayment' ? 'Record payment & allot No.' : action === 'activate' ? 'Activate & allot General No.' : action === 'returnToApplicant' ? 'Send back to applicant' : ACTION_LABEL[action];
  const disabled = a.busy || a.unconfirmed || (action === 'certify' && !flagged.length && (!allConfirmed || !mandate)) || (finalApproval && !route) || ((action === 'returnToApplicant' || action === 'reject') && remarks.trim().length < 10);

  const send = async (act: MembershipAction, input: MembershipActionInput) => {
    await a.run(async () => {
      const next = await api.applications.act(app.id, act, input);
      const n = next.application;
      const heading: Record<MembershipAction, string> = {
        sendToDdo: `Sent to ${next.waitingOn ?? 'the DDO'}`,
        certify: 'Certified. Sent to the office for review',
        forward: 'Recommended to the Secretary',
        approve: n.status === 'SHARE_PAYMENT_PENDING' ? 'Approved. Waiting for share payment' : n.status === 'ACTIVE' ? `Approved · General No. ${n.allottedGeneralNo ?? ''}` : 'Approved. Sent to the President',
        recordSharePayment: `Membership activated · General No. ${n.allottedGeneralNo ?? ''}`,
        activate: `Membership activated · General No. ${n.allottedGeneralNo ?? ''}`,
        returnToApplicant: 'Returned to the applicant',
        reject: 'Application rejected',
      };
      setDone({ heading: heading[act], description: `${n.name} · ${n.applicationNo}` });
    });
  };

  const submit = async () => {
    if (action === 'certify' && flagged.length) {
      const names = rows.filter((r) => flagged.includes(r.key)).map((r) => r.label.toLowerCase());
      return send('returnToApplicant', { field: ITEM_FIELD[flagged[0] as F1CertItem], remarks: `Please correct: ${names.join(', ')}.${remarks.trim() ? ` ${remarks.trim()}` : ''}` });
    }
    if (['reject', 'approve', 'recordSharePayment', 'activate', 'certify'].includes(action) && !(await ask(title, `${app.name} · ${app.applicationNo}. This can't be undone from the app.`, primaryText))) return;
    const input: MembershipActionInput = { ...(remarks.trim() ? { remarks: remarks.trim() } : {}) };
    if (action === 'certify') Object.assign(input, { items, mandateAgreed: mandate });
    if (action === 'returnToApplicant' && field) input.field = field;
    if (finalApproval && route) input.sharePaymentRoute = route;
    if (action === 'recordSharePayment') Object.assign(input, { mode, ...(reference.trim() ? { reference: reference.trim() } : {}) });
    return send(action, input);
  };

  if (done)
    return (
      <Screen header={<Header title={title} />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert {...done} />
      </Screen>
    );

  return (
    <Screen header={<Header title={title} onBack={() => router.back()} />} footer={<Button text={primaryText} size="lg" fullWidth buttonType={action === 'reject' ? 'danger' : 'primary'} loading={a.busy} disabled={disabled} onPress={() => void submit()} />}>
      <Card>
        <Text role="label">{app.name}</Text>
        <Text role="caption" tone="secondary">
          {app.applicationNo} · {app.designation} · {d.department?.name}
        </Text>
      </Card>
      <Text role="body" tone="secondary">
        {description}
      </Text>

      {action === 'certify' ? (
        <>
          <Section title="Items 1 to 7 (form F1)" right={<Button text="All correct" subType="inline" onPress={() => setItems(Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK'])))} />}>
            <View style={{ gap: space[4] }}>
              {rows.map((r) => (
                <Card key={r.key}>
                  <View style={{ gap: space[3] }}>
                    <View>
                      <Text role="caption" tone="tertiary">
                        {r.no} · {r.label}
                      </Text>
                      <Text role="label">{r.value}</Text>
                    </View>
                    <Segmented label={`Item ${r.no}`} value={items[r.key] ?? ''} options={[{ value: 'OK', label: 'Correct' }, { value: 'FLAG', label: 'Fix' }]} onChange={(v) => setItems((s) => ({ ...s, [r.key]: v as 'OK' | 'FLAG' }))} />
                  </View>
                </Card>
              ))}
            </View>
          </Section>
          {flagged.length ? (
            <TextField label="Note for the applicant (optional)" placeholder="e.g. Your service register shows 01 Jul 2021." value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />
          ) : (
            <Section title="Salary recovery mandate (form F6)">
              {(d.agreements.find((x) => x.key === 'recoveryMandate')?.summary ?? []).map((s) => (
                <Text key={s} role="caption" tone="secondary">
                  • {s}
                </Text>
              ))}
              <Checkbox checked={mandate} onChange={setMandate} label="AGREED: deduct society dues from this employee's salary" description={`As ${d.department?.ddoDesignation ?? 'DDO'}, ${d.department?.name ?? ''}`} />
              {a.fields.mandateAgreed ? (
                <Text role="caption" tone="danger">
                  {a.fields.mandateAgreed}
                </Text>
              ) : null}
            </Section>
          )}
        </>
      ) : null}

      {action === 'sendToDdo' || action === 'forward' ? (
        <Section title="Checks">
          <RuleChecks checks={d.checks} />
        </Section>
      ) : null}

      {action === 'forward' && app.ddoCertification ? <Alert type="success" heading="DDO certificate" description={`Items 1–7 certified and recovery mandate agreed by ${app.ddoCertification.byName}, ${app.ddoCertification.designation} · ${formatDisplayDateTime(app.ddoCertification.at)}`} /> : null}

      {action === 'approve' ? (
        <>
          <Card>
            <KeyValue label="Shares proposed" value={String(app.sharesProposed)} />
            <KeyValue label="Share capital" value={formatINR(d.shareAmount)} />
            <KeyValue label="DDO certificate" value={app.ddoCertification ? `${app.ddoCertification.byName}, ${app.ddoCertification.designation} · mandate agreed` : 'Not certified'} />
            {app.officeReview?.remarks ? <KeyValue label="Office remarks" value={`“${app.officeReview.remarks}”`} /> : null}
            <KeyValue label="Secretary" value={app.secretaryApproval ? `${app.secretaryApproval.byName} · ${formatDisplayDateTime(app.secretaryApproval.at)}` : 'Pending'} />
            <KeyValue label="President" value={app.presidentApproval ? `${app.presidentApproval.byName} · ${formatDisplayDateTime(app.presidentApproval.at)}` : 'Pending'} />
          </Card>
          {finalApproval ? (
            <Section title="Share payment">
              <View style={{ gap: space[4] }}>
                <ChoiceCard title="At the counter" description="The new member pays the cashier now. Membership starts on receipt." selected={route === 'COUNTER'} onPress={() => setRoute('COUNTER')} />
                <ChoiceCard title="On the first demand sheet" description="Membership starts now. Shares are added to the first salary demand." selected={route === 'FIRST_DEMAND'} onPress={() => setRoute('FIRST_DEMAND')} />
              </View>
            </Section>
          ) : null}
        </>
      ) : null}

      {action === 'recordSharePayment' || action === 'activate' ? (
        <Section title="Share capital">
          <Card>
            <Text role="sectionTitle">{formatINR(d.shareAmount)}</Text>
            <Text role="caption" tone="tertiary">
              {app.sharesProposed} shares · {amountInWords(d.shareAmount)}
            </Text>
          </Card>
          {action === 'recordSharePayment' ? (
            <>
              <Segmented label="Received as" value={mode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'CHEQUE', label: 'Cheque' }]} onChange={(v) => setMode(v as typeof mode)} />
              {mode !== 'CASH' ? <TextField label={mode === 'UPI' ? 'UPI reference' : 'Cheque number'} placeholder={mode === 'UPI' ? 'e.g. 4302 1187 6650' : 'e.g. 004512'} value={reference} onChangeText={setReference} required error={a.fields.reference} /> : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {action === 'returnToApplicant' ? <SelectField label="What needs correcting (optional)" value={field} options={[{ value: '', label: 'Not specified' }, ...RETURN_FIELDS]} onChange={setField} /> : null}

      {action !== 'certify' ? <TextField label={action === 'reject' ? 'Reason' : action === 'returnToApplicant' ? 'Message to the applicant' : 'Remarks'} placeholder={action === 'reject' ? 'e.g. Member of another credit society with dues.' : action === 'returnToApplicant' ? 'e.g. Upload a clear copy of the appointment order.' : 'Optional'} value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} required={action === 'reject' || action === 'returnToApplicant'} hint={action === 'reject' || action === 'returnToApplicant' ? 'The applicant sees this in the app. At least 10 characters.' : undefined} error={a.fields.remarks} /> : null}

      <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check the application', href: `/staff/joining/${app.id}` }} />
      <Text role="caption" tone="tertiary">
        Recorded with your name and time.
      </Text>
    </Screen>
  );
}
