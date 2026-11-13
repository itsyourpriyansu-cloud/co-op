// ST-46m Receipt: who paid what for which month and head, the notes counted, and the printable letterhead copy.
// G9 (D-119): the Accountant cancels a wrong counter receipt the same day, with a reason.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DENOMINATIONS, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ActionAlert, ask, Loaded, PrintButton, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { PURPOSE_LABEL, SOURCE_LABEL } from '@/lib/staffCollections';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.receipts.get(id) });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const a = useAction();
  const cancel = async (receiptNo: string) => {
    if (!(await ask('Cancel receipt', `${receiptNo} will be marked cancelled and the money taken back off the member\'s account.`, 'Cancel receipt'))) return;
    await a.run(() => api.receipts.cancel(id, reason.trim()), () => setCancelling(false));
  };
  return (
    <Screen header={<Header title="Receipt" onBack={() => router.back()} />}>
      <Loaded q={q} what="this receipt">
        {(d) => {
          const r = d.receipt;
          return (
            <>
              {r.cancelled ? <Alert type="error" heading="Cancelled" description={`${formatDisplayDateTime(r.cancelled.at)} by ${r.cancelled.byName}: ${r.cancelled.reason} (${r.cancelled.entryNo})`} /> : null}
              <View style={{ gap: space[2] }}>
                <Text role="pageTitle">{formatINR(r.amount)}</Text>
                <Text role="caption" tone="secondary">
                  {r.receiptNo} · {formatDisplayDate(r.date)}
                </Text>
                <Text role="caption" tone="tertiary">
                  {d.amountInWords}
                </Text>
              </View>
              <Card>
                <KeyValue label="Received from" value={d.member.name} />
                <KeyValue label="General No." value={d.member.generalNo} />
                <KeyValue label="Office" value={`${d.member.designation}, ${d.member.departmentName}`} />
                <KeyValue label="Mode" value={`${SOURCE_LABEL[r.source]}${r.reference ? ` · ${r.reference}` : ''}`} />
                {r.purpose ? <KeyValue label="Towards" value={PURPOSE_LABEL[r.purpose]} /> : d.sheet ? <KeyValue label="Against" value={`${formatCycle(d.sheet.cycle)} demand of ${d.sheet.departmentName}`} /> : null}
                <KeyValue label="Recorded by" value={`${r.byName ?? 'Salary recovery (DDO)'}${r.at ? ` · ${formatDisplayDateTime(r.at)}` : ''}`} />
              </Card>
              {d.lines.length ? (
                <Section title="Applied to">
                  <Card>
                    {d.lines.map((l, i) => (
                      <KeyValue key={i} label={`${l.cycle ? `${formatCycle(l.cycle)} · ` : ''}${l.label}${l.loanNo ? ` · ${l.loanNo}` : ''}`} value={formatINR(l.amount)} />
                    ))}
                    <KeyValue label="Total" value={formatINR(r.amount)} emphasis />
                  </Card>
                </Section>
              ) : null}
              {r.denominations ? (
                <Text role="caption" tone="secondary">
                  Notes counted:{' '}
                  {DENOMINATIONS.filter((n) => r.denominations?.[n])
                    .map((n) => `₹${n} × ${r.denominations![n]}`)
                    .join(' · ')}
                  {r.coins ? ` · coins ${formatINR(r.coins)}` : ''}
                </Text>
              ) : null}
              {r.remarks ? (
                <Text role="caption" tone="secondary">
                  Remarks: {r.remarks}
                </Text>
              ) : null}
              {d.report ? (
                <Text role="caption" tone="secondary">
                  Reported by the member in the app on {d.report.reportedAt ? formatDisplayDateTime(d.report.reportedAt) : formatDisplayDate(d.report.paidOn)} and verified against the bank statement.
                </Text>
              ) : null}
              <PrintButton path={`/payments/${r.id}`} />
              {d.canCancel && !cancelling ? <Button text="Cancel receipt" buttonType="secondary" fullWidth onPress={() => setCancelling(true)} /> : null}
              {d.canCancel && cancelling ? (
                <Section title="Cancel receipt">
                  <Text role="caption" tone="secondary">
                    Only for a mistake made today. The money is taken back off the member's account and a reversing entry is posted. The receipt stays, marked cancelled.
                  </Text>
                  <TextField label="Reason" required placeholder="e.g. Taken against the wrong member." value={reason} onChangeText={setReason} multiline numberOfLines={3} hint="Printed on the receipt and sent to the member. At least 10 characters." error={a.fields.reason} />
                  <Button text="Cancel receipt" buttonType="danger" fullWidth loading={a.busy} disabled={reason.trim().length < 10 || a.busy || a.unconfirmed} onPress={() => void cancel(r.receiptNo)} />
                  <Button text="Keep receipt" buttonType="secondary" fullWidth disabled={a.busy} onPress={() => setCancelling(false)} />
                </Section>
              ) : null}
              <ActionAlert action={a} heading="Couldn't cancel" check={{ text: 'Check the receipt', href: `/staff/payment/${r.id}` }} />
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
