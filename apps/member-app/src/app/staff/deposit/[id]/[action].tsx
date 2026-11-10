// ST-33m payment and acceptance, plus reject, cancel, refund, pay out and early withdrawal.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { DepositActionInput, DepositDetail } from '@tgs/types';
import { ActionAlert, ask, CashStatus, countsTotal, DenominationCounter, DoneAlert, Loaded, useAction, useTodayDate, type Counts } from '@/components/staff';
import { api } from '@/lib/api';
import { ACTION_LABEL, METHOD } from '@/lib/staffDeposits';
import { Alert, Button, Card, DateField, Divider, Header, KeyValue, Screen, Segmented, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function DepositAction() {
  const { id, action } = useLocalSearchParams<{ id: string; action: string }>();
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id) });
  return (
    <Loaded page q={q} what="this deposit">
      {(d) => <Decision d={d} action={action} />}
    </Loaded>
  );
}

function Decision({ d, action }: { d: DepositDetail; action: string }) {
  const dep = d.deposit;
  const a = useAction();
  const { today, date, setDate } = useTodayDate();
  const [mode, setMode] = useState<'CASH' | 'TRANSFER' | 'CHEQUE'>('CASH');
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [done, setDone] = useState<{ heading: string; description?: string }>();
  const preview = useQuery({ queryKey: ['deposit-withdrawal', dep.id], queryFn: () => api.deposits.withdrawalPreview(dep.id), enabled: action === 'withdraw', retry: false });

  const needsReason = action === 'reject';
  const principal = dep.principal ?? 0;
  const ready = action === 'recordPayment' ? (mode === 'CASH' ? countsTotal(counts) === principal : Boolean(reference.trim())) && Boolean(date) : action === 'withdraw' ? Boolean(preview.data) : needsReason ? Boolean(remarks.trim()) : true;
  const title = action === 'recordPayment' ? 'Receive payment (cash slip)' : action === 'accept' ? (dep.status === 'ACCEPTANCE_PRESIDENT' ? 'Accept deposit (2 of 2)' : 'Accept deposit (1 of 2)') : (ACTION_LABEL[action] ?? action);
  const danger = action === 'reject' || action === 'withdraw';

  const submit = async () => {
    const message = action === 'recordPayment' ? `Receive ${formatINR(principal)} from ${d.member.name}. This posts to the ledger.` : action === 'withdraw' ? `Pay ${formatINR(preview.data?.payable ?? 0)} to ${d.member.name} and close this deposit.` : `${d.member.name} · ${dep.accountNo}. Recorded with your name and time.`;
    if (!(await ask(title, message, ACTION_LABEL[action] ?? 'Confirm'))) return;
    const input: DepositActionInput = {
      ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      ...(action === 'recordPayment' ? { payment: { mode, date: date ?? '', ...(mode === 'CASH' ? { denominations: counts } : { reference: reference.trim() }) } } : {}),
    };
    await a.run(async () => {
      const next = await api.deposits.act(dep.id, action, input);
      setDone({ heading: next.deposit.status === 'ACTIVE' ? `FD active · ${next.deposit.fdrNo ?? ''}` : `${ACTION_LABEL[action] ?? action} · done`, ...(next.waitingOn ? { description: `Now with ${next.waitingOn}` } : {}) });
    });
  };

  if (done)
    return (
      <Screen header={<Header title={title} />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert {...done} />
      </Screen>
    );

  const p = preview.data;
  return (
    <Screen
      header={<Header title={title} onBack={() => router.back()} />}
      footer={
        <View style={{ gap: space[3] }}>
          {action === 'recordPayment' && mode === 'CASH' ? <CashStatus amount={principal} counts={counts} /> : null}
          <Button text={ACTION_LABEL[action] ?? action} size="lg" fullWidth buttonType={danger ? 'danger' : 'primary'} loading={a.busy} disabled={!ready || a.busy || a.unconfirmed} onPress={() => void submit()} />
        </View>
      }
    >
      <Card>
        <Text role="label">
          {formatINR(principal)} for {dep.tenureMonths} months at {dep.ratePercent}%
        </Text>
        <Text role="caption" tone="secondary">
          {d.member.name} · No. {d.member.generalNo} · {dep.accountNo}
        </Text>
        <Text role="caption" tone="tertiary">
          {amountInWords(principal)}
        </Text>
      </Card>

      {action === 'recordPayment' ? (
        <View style={{ gap: space[8] }}>
          <Segmented label="Received as" value={mode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'TRANSFER', label: 'Transfer' }, { value: 'CHEQUE', label: 'Cheque' }]} onChange={(v) => setMode(v as typeof mode)} />
          {mode === 'CASH' ? <DenominationCounter amount={principal} counts={counts} onChange={setCounts} /> : <TextField label={mode === 'CHEQUE' ? 'Cheque number' : 'UTR / reference'} required value={reference} onChangeText={setReference} error={a.fields.reference ?? a.fields['payment.reference']} />}
          {a.fields.denominations ? (
            <Text role="caption" tone="danger">
              {a.fields.denominations}
            </Text>
          ) : null}
          <DateField key={today} label="Date received" required value={date} onChange={setDate} hint="Interest runs from this date" error={a.fields.date ?? a.fields['payment.date']} />
        </View>
      ) : null}

      {action === 'accept' ? (
        <Card>
          <KeyValue label="Payment" value={dep.payment ? `${dep.payment.mode === 'CASH' ? 'Cash' : dep.payment.mode === 'TRANSFER' ? 'Bank transfer' : 'Cheque'} · ${dep.payment.receiptNo}` : '—'} />
          <KeyValue label="Received on" value={dep.payment ? formatDisplayDate(dep.payment.date) : '—'} />
          <KeyValue label="Matures" value={d.maturity ? formatDisplayDate(d.maturity.date) : '—'} />
          <KeyValue label="Maturity value" value={d.maturity ? formatINR(d.maturity.value) : '—'} />
          <KeyValue label="Secretary" value={dep.signOffs?.secretary ? `${dep.signOffs.secretary.byName} · ${formatDisplayDateTime(dep.signOffs.secretary.at)}` : 'Pending'} />
          <KeyValue label="President" value={dep.status === 'ACCEPTANCE_PRESIDENT' ? 'Your signature issues the FDR' : 'Next'} />
        </Card>
      ) : null}

      {action === 'withdraw' && preview.isError ? <Alert type="error" heading="Cannot withdraw" description={preview.error instanceof Error ? preview.error.message : 'Try again.'} /> : null}
      {action === 'withdraw' && p ? (
        <Card>
          <KeyValue label="Principal (returned in full)" value={formatINR(p.principal)} />
          <KeyValue label="Held" value={`${p.monthsHeld} completed months at ${p.ratePercent}%`} />
          <KeyValue label="Interest earned" value={formatINR(p.interestEarned)} />
          {p.alreadyPaid > 0 ? <KeyValue label="Interest already paid out" value={formatINR(p.alreadyPaid)} /> : null}
          <KeyValue label={`Penalty (${p.penaltyPercent}${p.method === 'RATE_CUT' ? ' points' : '%'}, ${METHOD[p.method]})`} value={formatINR(p.penalty)} />
          <KeyValue label="Interest paid" value={formatINR(p.interestPayable)} />
          <Divider />
          <KeyValue label="Paid to the member" value={formatINR(p.payable)} emphasis />
        </Card>
      ) : null}

      <TextField label={needsReason ? 'Reason (the member sees this)' : 'Remarks'} value={remarks} onChangeText={setRemarks} multiline numberOfLines={2} placeholder={needsReason ? 'e.g. KYC does not match' : 'Optional'} required={needsReason} error={a.fields.remarks} />
      <ActionAlert action={a} heading="Not saved" check={{ text: 'Check the deposit', href: `/staff/deposit/${dep.id}` }} />
    </Screen>
  );
}
