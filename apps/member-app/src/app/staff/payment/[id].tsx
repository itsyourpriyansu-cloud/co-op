// ST-46m Receipt: who paid what for which month and head, the notes counted, and the printable letterhead copy.
// G9 (D-119): the Accountant cancels a wrong counter receipt the same day, with a reason.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DENOMINATIONS, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ActionAlert, ask, Loaded, useAction, StaffDocument } from '@/components/staff';
import { api } from '@/lib/api';
import { documentFileName, receiptHtml } from '@/lib/documents';
import { PURPOSE_LABEL, SOURCE_LABEL } from '@/lib/staffCollections';
import { Banner, Button, Card, Header, MetadataListItem, Screen, Section, Text, TextField } from '@/ui';
import { spacing } from '@/theme';

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
              {r.cancelled ? <Banner status="error" heading="Cancelled" description={`${formatDisplayDateTime(r.cancelled.at)} by ${r.cancelled.byName}: ${r.cancelled.reason} (${r.cancelled.entryNo})`} /> : null}
              <View style={{ gap: spacing[1] }}>
                <Text type="h1">{formatINR(r.amount)}</Text>
                <Text type="supporting" tone="secondary">
                  {r.receiptNo} · {formatDisplayDate(r.date)}
                </Text>
                <Text type="supporting" tone="secondary">
                  {d.amountInWords}
                </Text>
              </View>
              <Card>
                <MetadataListItem label="Received from" value={d.member.name} />
                <MetadataListItem label="General No." value={d.member.generalNo} />
                <MetadataListItem label="Office" value={`${d.member.designation}, ${d.member.departmentName}`} />
                <MetadataListItem label="Mode" value={`${SOURCE_LABEL[r.source]}${r.reference ? ` · ${r.reference}` : ''}`} />
                {r.purpose ? <MetadataListItem label="Towards" value={PURPOSE_LABEL[r.purpose]} /> : d.sheet ? <MetadataListItem label="Against" value={`${formatCycle(d.sheet.cycle)} demand of ${d.sheet.departmentName}`} /> : null}
                <MetadataListItem label="Recorded by" value={`${r.byName ?? 'Salary recovery (DDO)'}${r.at ? ` · ${formatDisplayDateTime(r.at)}` : ''}`} />
              </Card>
              {d.lines.length ? (
                <Section title="Applied to">
                  <Card>
                    {d.lines.map((l, i) => (
                      <MetadataListItem key={i} label={`${l.cycle ? `${formatCycle(l.cycle)} · ` : ''}${l.label}${l.loanNo ? ` · ${l.loanNo}` : ''}`} value={formatINR(l.amount)} />
                    ))}
                    <MetadataListItem label="Total" value={formatINR(r.amount)} emphasis />
                  </Card>
                </Section>
              ) : null}
              {r.denominations ? (
                <Text type="supporting" tone="secondary">
                  Notes counted:{' '}
                  {DENOMINATIONS.filter((n) => r.denominations?.[n])
                    .map((n) => `₹${n} × ${r.denominations![n]}`)
                    .join(' · ')}
                  {r.coins ? ` · coins ${formatINR(r.coins)}` : ''}
                </Text>
              ) : null}
              {r.remarks ? (
                <Text type="supporting" tone="secondary">
                  Remarks: {r.remarks}
                </Text>
              ) : null}
              {d.report ? (
                <Text type="supporting" tone="secondary">
                  Reported by the member in the app on {d.report.reportedAt ? formatDisplayDateTime(d.report.reportedAt) : formatDisplayDate(d.report.paidOn)} and verified against the bank statement.
                </Text>
              ) : null}
              <StaffDocument title={`Receipt ${r.receiptNo}`} fileName={documentFileName('Receipt', r.receiptNo)} build={(o) => receiptHtml(d, { ...o, paidBy: SOURCE_LABEL[r.source], copy: 'office' })} />
              {d.canCancel && !cancelling ? <Button label="Cancel receipt" variant="secondary" fullWidth onPress={() => setCancelling(true)} /> : null}
              {d.canCancel && cancelling ? (
                <Section title="Cancel receipt">
                  <Text type="supporting" tone="secondary">
                    Only for a mistake made today. The money is taken back off the member's account and a reversing entry is posted. The receipt stays, marked cancelled.
                  </Text>
                  <TextField label="Reason" required placeholder="e.g. Taken against the wrong member." value={reason} onChangeText={setReason} multiline numberOfLines={3} hint="Printed on the receipt and sent to the member. At least 10 characters." error={a.fields.reason} />
                  <Button label="Cancel receipt" variant="destructive" fullWidth loading={a.busy} disabled={reason.trim().length < 10 || a.busy || a.unconfirmed} onPress={() => void cancel(r.receiptNo)} />
                  <Button label="Keep receipt" variant="secondary" fullWidth disabled={a.busy} onPress={() => setCancelling(false)} />
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
