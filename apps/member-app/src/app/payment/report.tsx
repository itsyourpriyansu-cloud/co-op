// MB-18 Report a payment (D-043): amount (+ words), what it was for, date (≤ today), mode, UTR /
// cheque no., optional screenshot (simulated), and where to pay. Submit → "Being verified" → the
// cashier matches it with the bank statement and a receipt appears in MB-10.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Send, X } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatINR } from '@tgs/domain';
import type { ReportPaymentInput } from '@tgs/types';
import { api } from '@/lib/api';
import { paymentKeys, useMyPayments } from '@/lib/payments';
import { Alert, Button, Card, ChoiceCard, DateField, Header, KeyValue, Screen, Section, Segmented, Skeleton, Text, TextField } from '@/ui';
import { color, radius, space } from '@/theme';

const paise = (t: string) => Math.round(Number(t.replace(/[^0-9]/g, '') || 0) * 100);

export default function ReportPayment() {
  const qc = useQueryClient();
  const q = useMyPayments();
  const d = q.data;
  const [towards, setTowards] = useState<ReportPaymentInput['towards'] | undefined>();
  const [amountText, setAmountText] = useState('');
  const [paidOn, setPaidOn] = useState<string | undefined>();
  const [mode, setMode] = useState<ReportPaymentInput['mode']>('UPI');
  const [reference, setReference] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pick = towards ?? (d?.dues.totalArrears ? 'DUES' : d?.dues.shareCapitalDue ? 'SHARE_CAPITAL' : 'DUES');
  const owed = d ? (pick === 'DUES' ? d.dues.totalArrears : d.dues.shareCapitalDue) : 0;
  const amount = amountText ? paise(amountText) : owed;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setServerError(undefined);
    try {
      await api.myPayments.report({ amount, paidOn: paidOn ?? '', mode, reference, towards: pick, ...(screenshot ? { screenshotName: screenshot } : {}) });
      await qc.invalidateQueries({ queryKey: paymentKeys.mine });
      router.back();
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setServerError(isApiError(e) ? e.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const nothingDue = Boolean(d && !d.dues.totalArrears && !d.dues.shareCapitalDue);
  if (nothingDue)
    return (
      <Screen header={<Header title="Report a payment" onBack={() => router.back()} />} footer={<Button text="Back to payments" buttonType="secondary" size="lg" fullWidth onPress={() => router.back()} />}>
        <Alert type="success" heading="Nothing unpaid" description="Every month was deducted from your salary in full, so there is nothing to report. If a deduction comes short, it shows on the Payments tab and you can report a bank or UPI payment here." />
      </Screen>
    );

  return (
    <Screen header={<Header title="Report a payment" onBack={() => router.back()} />} footer={<Button text="Send for verification" leftSlot={Send} size="lg" fullWidth loading={busy} disabled={!d || !owed} onPress={() => void submit()} />}>
      {!d ? (
        <Skeleton height={240} radius={radius.card} />
      ) : (
        <>
          <Text role="body" tone="secondary">
            Paid the society by bank transfer, UPI or a cheque deposit? Tell us here. The cashier matches it with the bank statement and you get a receipt.
          </Text>
          {serverError ? <Alert type="error" heading="Not sent" description={serverError} /> : null}

          <Section title="What was it for">
            <ChoiceCard title="Unpaid dues" description={d.dues.totalArrears ? `${formatINR(d.dues.totalArrears)} from short months` : 'Nothing unpaid'} selected={pick === 'DUES'} onPress={() => d.dues.totalArrears && setTowards('DUES')} />
            {d.dues.shareCapitalDue ? <ChoiceCard title="Share capital" description={`${formatINR(d.dues.shareCapitalDue)} due`} selected={pick === 'SHARE_CAPITAL'} onPress={() => setTowards('SHARE_CAPITAL')} /> : null}
            {errors.towards ? (
              <Text role="caption" tone="danger">
                {errors.towards}
              </Text>
            ) : null}
          </Section>

          <TextField label="Amount paid" prefix="₹" keyboardType="number-pad" value={amountText || (owed ? String(owed / 100) : '')} onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))} error={errors.amount} hint={amount > 0 ? amountInWords(amount) : undefined} required />
          <DateField label="Paid on" value={paidOn} onChange={setPaidOn} error={errors.paidOn} hint="DD/MM/YYYY, today or earlier" required />
          <Segmented label="Paid by" value={mode} options={[{ value: 'UPI', label: 'UPI' }, { value: 'BANK_TRANSFER', label: 'Bank' }, { value: 'CHEQUE_DEPOSIT', label: 'Cheque' }]} onChange={setMode} error={errors.mode} />
          <TextField label={mode === 'CHEQUE_DEPOSIT' ? 'Cheque number' : 'UTR / transaction ID'} autoCapitalize="characters" value={reference} onChangeText={setReference} error={errors.reference} hint="As shown in your bank app or on the slip" required />

          {screenshot ? (
            <View style={styles.file}>
              <ImagePlus size={18} color={color.brand.solid} />
              <Text role="caption" style={{ flex: 1 }}>
                {screenshot}
              </Text>
              <Button text="Remove" size="sm" buttonType="secondary" subType="inline" leftSlot={X} onPress={() => setScreenshot(undefined)} />
            </View>
          ) : (
            <Button text="Attach a screenshot (optional)" buttonType="secondary" leftSlot={ImagePlus} fullWidth onPress={() => setScreenshot('payment-screenshot.jpg')} />
          )}

          <Section title="Where to pay">
            <Card>
              <KeyValue label="Account name" value={d.payTo.accountName} />
              <KeyValue label="Account no." value={d.payTo.accountNo} />
              <KeyValue label="IFSC" value={d.payTo.ifsc} />
              <KeyValue label="UPI" value={d.payTo.upi} />
              <Text role="caption" tone="tertiary">
                Or pay in cash at the {d.payTo.counter}.
              </Text>
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  file: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[6], borderRadius: radius.control, borderWidth: 1, borderColor: color.brand.border, backgroundColor: color.brand.subtle },
});
