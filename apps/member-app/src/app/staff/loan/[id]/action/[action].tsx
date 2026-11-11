// ST-24m … ST-28m review, DDO certificate, assessment, sanction and disbursement, one pushed screen per drawer.
// The server re-validates everything; this only guides.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react-native';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { LoanActionInput, LoanDetail } from '@tgs/types';
import { ActionAlert, ask, DoneAlert, Loaded, MoneyField, RuleChecks, useAction, useDebounced, useTodayDate } from '@/components/staff';
import { StaffSanctionSheet } from '@/components/StaffSanctionSheet';
import { api } from '@/lib/api';
import { ACTION_LABEL, NEEDS_REASON, TITLES } from '@/lib/staffLoans';
import { Alert, Button, Card, Checkbox, DateField, Header, KeyValue, Screen, Section, Segmented, Text, TextField } from '@/ui';
import { color, space } from '@/theme';

const CONFIRM = new Set(['reject', 'secretarySign', 'presidentSign', 'disburse', 'sendForSanction']);

export default function LoanAction() {
  const { id, action } = useLocalSearchParams<{ id: string; action: string }>();
  const q = useQuery({ queryKey: ['loan', id], queryFn: () => api.loans.get(id) });
  return (
    <Loaded page q={q} what="this loan">
      {(d) => <Decision d={d} action={action} />}
    </Loaded>
  );
}

function Decision({ d, action }: { d: LoanDetail; action: string }) {
  const l = d.loan;
  const a = useAction();
  const { today, date, setDate } = useTodayDate();
  const [remarks, setRemarks] = useState('');
  const [member, setMember] = useState(false);
  const [docs, setDocs] = useState(false);
  const [feasible, setFeasible] = useState(false);
  const [manual, setManual] = useState({ ddoName: '', designation: 'Assistant Secretary', reference: '' });
  const [amount, setAmount] = useState(l.sanctionedAmount ?? l.appliedAmount);
  const [instalments, setInstalments] = useState(l.sanctionedInstalments ?? l.appliedInstalments);
  const [mode, setMode] = useState<'NEFT' | 'CHEQUE' | 'TRANSFER'>('NEFT');
  const [reference, setReference] = useState('');
  const [payee, setPayee] = useState('');
  const [done, setDone] = useState<{ heading: string; description: string }>();

  const dAmount = useDebounced(amount);
  const dInstalments = useDebounced(instalments);
  const preview = useQuery({ queryKey: ['sanction-preview', l.id, dAmount, dInstalments], queryFn: () => api.loans.sanctionPreview(l.id, dAmount, dInstalments), enabled: action === 'sendForSanction' && dAmount > 0 && dInstalments > 0, placeholderData: (p) => p });

  const meta = TITLES[action] ?? { title: ACTION_LABEL[action] ?? action, description: '' };
  const fe = { ...(preview.data?.fieldErrors ?? {}), ...a.fields };
  const blocks = d.checks.filter((c) => !c.pass && c.severity === 'block');
  const sheet = action === 'sendForSanction' ? preview.data?.sheet : l.sanctionSheet;
  const needsReason = NEEDS_REASON.has(action);
  const ready =
    action === 'forward' ? member && docs && !blocks.length
    : action === 'ddoCertify' ? feasible
    : action === 'ddoRecordManual' ? Boolean(manual.ddoName.trim() && manual.designation.trim() && date && manual.reference.trim())
    : action === 'sendForSanction' ? Boolean(preview.data && !Object.keys(preview.data.fieldErrors).length && preview.data.sheet.netDisbursable > 0)
    : action === 'disburse' ? Boolean(reference.trim() && date)
    : needsReason ? Boolean(remarks.trim())
    : true;

  const input = (): LoanActionInput => {
    const base = remarks.trim() ? { remarks: remarks.trim() } : {};
    switch (action) {
      case 'forward':
        return { ...base, checklist: { memberVerified: member, documentsVerified: docs } };
      case 'ddoCertify':
        return { ...base, recoveryFeasible: feasible };
      case 'ddoRecordManual':
        return { ...base, manual: { ...manual, date: date ?? '' } };
      case 'sendForSanction':
        return { ...base, amount, instalments };
      case 'disburse':
        return { ...base, disbursement: { mode, reference: reference.trim(), date: date ?? '', ...(payee.trim() ? { payee: payee.trim() } : {}) } };
      default:
        return base;
    }
  };

  const submit = async () => {
    if (CONFIRM.has(action)) {
      const message = action === 'disburse' ? `Pay ${formatINR(l.netDisbursable ?? d.preview.netDisbursable)} to ${payee.trim() || d.member.name}. This posts to the ledger.` : `${d.member.name} · ${l.loanNo ?? l.applicationNo}. Recorded with your name and time.`;
      if (!(await ask(meta.title, message, ACTION_LABEL[action] ?? 'Confirm'))) return;
    }
    await a.run(async () => {
      const next = await api.loans.act(l.id, action, input());
      setDone({ heading: `${ACTION_LABEL[action] ?? action} · done`, description: `${next.loan.loanNo ?? next.loan.applicationNo} is now ${next.waitingOn ? `with ${next.waitingOn}` : next.loan.status.toLowerCase().replace(/_/g, ' ')}` });
    });
  };

  if (done)
    return (
      <Screen header={<Header title={meta.title} />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert {...done} />
      </Screen>
    );

  return (
    <Screen header={<Header title={meta.title} onBack={() => router.back()} />} footer={<Button text={ACTION_LABEL[action] ?? action} size="lg" fullWidth buttonType={action === 'reject' ? 'danger' : 'primary'} loading={a.busy} disabled={!ready || a.busy || a.unconfirmed} onPress={() => void submit()} />}>
      <Card>
        <Text role="label">
          {d.member.name} · No. {d.member.generalNo}
        </Text>
        <Text role="caption" tone="secondary">
          {d.product.name} · {formatINR(l.sanctionedAmount ?? l.appliedAmount)} · {l.sanctionedInstalments ?? l.appliedInstalments} months · {d.member.departmentName}
        </Text>
      </Card>
      <Text role="body" tone="secondary">
        {meta.description}
      </Text>

      {action === 'forward' ? (
        <Section title="Checklist">
          <Checkbox checked={member} onChange={setMember} label="Member details match the member master" />
          <Checkbox checked={docs} onChange={setDocs} label="Application and documents verified" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <CircleCheck size={18} color={color.status.success.fg} />
            <Text role="body" style={{ flex: 1 }}>
              Sureties confirmed in the app ({d.sureties.filter((s) => s.status === 'ACCEPTED').length} of {d.product.suretiesRequired})
            </Text>
          </View>
          <RuleChecks checks={d.checks} />
          {blocks.length ? <Alert type="error" heading="A rule fails" description="Return or reject the application instead." /> : null}
        </Section>
      ) : null}

      {action === 'ddoCertify' ? (
        <Section title="Items 1–5">
          <Card>
            <KeyValue label="1 · Name, General No." value={`${d.member.name}, ${d.member.generalNo}`} />
            <KeyValue label="2 · Date of birth" value={formatDisplayDate(d.member.dob)} />
            <KeyValue label="3 · Date of retirement" value={formatDisplayDate(d.member.dor)} />
            <KeyValue label="4 · Office, designation" value={`${d.member.departmentName}, ${d.member.designation}`} />
            {l.form?.pay ? <KeyValue label="5 · Gross / net salary" value={`${formatINR(l.form.pay.grossSalary)} / ${formatINR(d.preview.netSalary)}`} /> : null}
          </Card>
          <Checkbox checked={feasible} onChange={setFeasible} label="Particulars are correct and the instalments can be recovered from salary" />
        </Section>
      ) : null}

      {action === 'ddoRecordManual' ? (
        <Section title="Paper certificate">
          <View style={{ gap: space[8] }}>
            <TextField label="DDO name" required value={manual.ddoName} onChangeText={(v) => setManual((m) => ({ ...m, ddoName: v }))} placeholder={d.member.departmentName} />
            <TextField label="Designation" required value={manual.designation} onChangeText={(v) => setManual((m) => ({ ...m, designation: v }))} />
            <DateField key={today} label="Date of the certificate" required value={date} onChange={setDate} />
            <TextField label="Letter reference" required value={manual.reference} onChangeText={(v) => setManual((m) => ({ ...m, reference: v }))} placeholder="e.g. FIN/DDO/2026/118" error={fe.manual} />
          </View>
        </Section>
      ) : null}

      {action === 'sendForSanction' ? (
        <Section title="Sanction">
          <View style={{ gap: space[8] }}>
            <MoneyField label="Amount to sanction" value={amount} onChange={setAmount} error={fe.amount} hint={`Applied ${amountInWords(l.appliedAmount)}`} />
            <TextField label="Instalments" keyboardType="number-pad" suffix={<Text role="caption" tone="tertiary">months</Text>} value={Number.isFinite(instalments) ? String(instalments) : ''} onChangeText={(t) => setInstalments(t === '' ? Number.NaN : Number(t.replace(/\D/g, '')))} error={fe.instalments} hint={preview.data ? `At most ${Math.min(preview.data.maxInstalments, l.appliedInstalments)}` : undefined} />
          </View>
        </Section>
      ) : null}

      {sheet && ['sendForSanction', 'secretarySign', 'presidentSign', 'disburse', 'sendBack'].includes(action) ? (
        <Section title="For office use · sanction sheet">
          <StaffSanctionSheet sheet={sheet} />
        </Section>
      ) : null}

      {action === 'secretarySign' || action === 'presidentSign' || action === 'sendBack' ? (
        <Section title="Sign-offs">
          <Card>
            {[
              { role: 'Assessed by the Accountant', s: l.signOffs?.assessment },
              { role: 'Secretary', s: l.signOffs?.secretary },
              { role: 'President', s: l.signOffs?.president },
            ].map((r) => (
              <KeyValue key={r.role} label={r.role} value={r.s ? `${r.s.byName} · ${formatDisplayDateTime(r.s.at)}${r.s.remarks ? ` · “${r.s.remarks}”` : ''}` : 'Pending'} />
            ))}
          </Card>
        </Section>
      ) : null}

      {action === 'disburse' ? (
        <Section title="Payment">
          <View style={{ gap: space[8] }}>
            <Segmented label="Mode" value={mode} options={[{ value: 'NEFT', label: 'NEFT / RTGS' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'TRANSFER', label: 'Transfer' }]} onChange={(v) => setMode(v as typeof mode)} />
            <TextField label={mode === 'CHEQUE' ? 'Cheque number' : 'UTR / reference'} required value={reference} onChangeText={setReference} error={fe.reference ?? fe['disbursement.reference']} />
            <TextField label="Paid to (only if not the borrower)" value={payee} onChangeText={setPayee} hint="F7: the borrower authorises payment to this person" error={fe.payee ?? fe['disbursement.payee']} />
            <DateField key={today} label="Payment date" required value={date} onChange={setDate} error={fe.date ?? fe['disbursement.date']} />
            <Card>
              <KeyValue label={`Pay to ${d.member.name}${l.parentLoanId ? ' (after settling the old loan)' : ''}`} value={formatINR(l.netDisbursable ?? d.preview.netDisbursable)} emphasis />
            </Card>
          </View>
        </Section>
      ) : null}

      <TextField label={needsReason ? 'Reason (the member sees this)' : 'Remarks'} value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} placeholder={needsReason ? 'e.g. Attach the salary certificate' : 'Optional'} required={needsReason} error={fe.remarks} />
      <ActionAlert action={a} heading="Not saved" check={{ text: 'Check the loan', href: `/staff/loan/${l.id}` }} />
      <Text role="caption" tone="tertiary">
        Recorded with your name and time.
      </Text>
    </Screen>
  );
}
