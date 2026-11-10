// ST-47m Verify a reported payment (D-043): match the bank reference, then verify (receipt, BR-011) or reject.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { allocateDuesPayment, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { PaymentReportRow, ReceiptDetail } from '@tgs/types';
import { ActionAlert, ask, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { REPORT_MODE_LABEL } from '@/lib/staffCollections';
import { Alert, Button, Card, Checkbox, Header, KeyValue, Screen, Section, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function VerifyPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['payment-reports'], queryFn: () => api.receipts.reports() });
  return (
    <Loaded page q={q} what="this payment">
      {(rows) => {
        const r = rows.find((x) => x.id === id);
        return r ? (
          <Verify r={r} />
        ) : (
          <Screen header={<Header title="Verify payment" onBack={() => router.back()} />}>
            <Alert type="neutral" heading="Not found" description="This report may have been handled already." />
          </Screen>
        );
      }}
    </Loaded>
  );
}

function Verify({ r }: { r: PaymentReportRow }) {
  const dues = useQuery({ queryKey: ['dues', r.memberId], queryFn: () => api.receipts.dues(r.memberId) });
  const [matched, setMatched] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string>();
  const a = useAction();
  const share = r.towards === 'SHARE_CAPITAL';
  const preview = useMemo(() => {
    if (!dues.data || share) return [];
    const res = allocateDuesPayment(dues.data.arrears.map((x) => ({ key: x.cycle, penal: x.penal, components: x.components })), r.amount);
    return res.cycles.flatMap((c, i) => [{ cycle: c.key, label: 'Penal interest', delta: c.penalPaid }, ...c.components.map((x, j) => ({ cycle: c.key, label: dues.data!.arrears[i]!.components[j]!.label, delta: x.allocated - dues.data!.arrears[i]!.components[j]!.allocated }))]).filter((x) => x.delta > 0);
  }, [dues.data, r.amount, share]);

  const verify = async () => {
    if (!(await ask('Verify payment', `${formatINR(r.amount)} from ${r.memberName}. This creates the receipt and posts to the ledger.`, 'Verify'))) return;
    let saved: ReceiptDetail | undefined;
    const ok = await a.run(async () => {
      saved = await api.receipts.verify(r.id);
    });
    if (ok && saved) router.replace(`/staff/payment/${saved.receipt.id}`);
  };
  const reject = () => void a.run(() => api.receipts.reject(r.id, reason.trim()), () => setDone('Rejected · member notified'));

  if (done)
    return (
      <Screen header={<Header title="Verify payment" />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <DoneAlert heading={done} description={`${r.memberName} · ${formatINR(r.amount)}`} />
      </Screen>
    );

  return (
    <Screen
      header={<Header title="Verify payment" onBack={() => router.back()} />}
      footer={
        <View style={{ gap: space[3] }}>
          {rejecting ? (
            <>
              <Button text="Reject payment" size="lg" fullWidth buttonType="danger" loading={a.busy} disabled={reason.trim().length < 10 || a.busy || a.unconfirmed} onPress={reject} />
              <Button text="Back" buttonType="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(false)} />
            </>
          ) : (
            <>
              <Button text="Verify & create receipt" size="lg" fullWidth loading={a.busy} disabled={!matched || a.busy || a.unconfirmed} onPress={() => void verify()} />
              <Button text="Reject" buttonType="secondary" fullWidth disabled={a.busy} onPress={() => setRejecting(true)} />
            </>
          )}
        </View>
      }
    >
      <Text role="body" tone="secondary">
        Find the credit in the bank statement, then verify to create the receipt, or reject with a reason the member sees.
      </Text>
      <Card>
        <Text role="label">{r.memberName}</Text>
        <Text role="caption" tone="secondary">
          No. {r.generalNo} · {r.departmentName}
        </Text>
        <KeyValue label="Amount" value={formatINR(r.amount)} emphasis />
        <KeyValue label="Paid on" value={formatDisplayDate(r.paidOn)} />
        <KeyValue label="Mode" value={REPORT_MODE_LABEL[r.mode]} />
        <KeyValue label="Reference" value={r.reference} />
        <KeyValue label="Towards" value={share ? 'Share capital' : 'Dues'} />
        <KeyValue label="Reported" value={r.reportedAt ? formatDisplayDateTime(r.reportedAt) : '—'} />
        {r.screenshotName ? <KeyValue label="Screenshot" value={r.screenshotName} /> : null}
      </Card>
      {dues.data ? (
        <Section title="Applied to, oldest month first">
          <Card>
            {share ? (
              <Text role="body">
                Share capital · {formatINR(r.amount)} of {formatINR(dues.data.shareCapitalDue)} due
              </Text>
            ) : (
              preview.map((p, i) => <KeyValue key={i} label={`${formatCycle(p.cycle)} · ${p.label}`} value={formatINR(p.delta)} />)
            )}
          </Card>
          <Text role="caption" tone="tertiary">
            Dues before: {formatINR(dues.data.totalArrears)} · after: {formatINR(Math.max(0, dues.data.totalArrears - (share ? 0 : r.amount)))}
          </Text>
        </Section>
      ) : null}
      {rejecting ? <TextField label="Reason" required placeholder="e.g. No matching credit found in the bank statement." value={reason} onChangeText={setReason} multiline numberOfLines={3} hint="The member sees this in the app. At least 10 characters." error={a.fields.reason} /> : <Checkbox checked={matched} onChange={setMatched} label="I found this credit in the society's bank statement" description={`Reference ${r.reference} for ${formatINR(r.amount)} on ${formatDisplayDate(r.paidOn)}`} />}
      <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check Payments', href: '/staff/payments?tab=REPORTED' }} />
    </Screen>
  );
}
