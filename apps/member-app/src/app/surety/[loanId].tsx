// MB-07 Surety request detail (J-02, form F2 items 9–12): the loan, my own particulars as they
// print on the form, the loans I already guarantee, the undertaking → Sign with OTP, or decline.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine, X } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import { api } from '@/lib/api';
import { Alert, Button, Card, Header, KeyValue, OtpInput, Screen, Section, Skeleton, StatusTag, Text, TextField } from '@/ui';
import { radius, space } from '@/theme';

const KEY = ['surety-requests'] as const;

export default function SuretyRequestDetail() {
  const { loanId = '' } = useLocalSearchParams<{ loanId: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: api.surety.list });
  const r = [...(q.data?.requests ?? []), ...(q.data?.guaranteeing ?? [])].find((x) => x.loanId === loanId);
  const [signing, setSigning] = useState<{ otpRef: string; demoOtp?: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      after?.();
    } catch (e) {
      setError(isApiError(e) ? (e.fieldErrors?.otp ?? e.fieldErrors?.reason ?? e.message) : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  const open = r?.myStatus === 'PENDING' && r.status === 'SURETY_PENDING' && !done;

  return (
    <Screen
      header={<Header title="Surety request" onBack={() => router.back()} />}
      footer={
        open ? (
          signing ? (
            <Button text="Confirm & sign" size="lg" fullWidth disabled={otp.length !== 6} loading={busy} onPress={() => void run(() => api.surety.accept(loanId, signing.otpRef, otp), () => { setDone('accepted'); void qc.invalidateQueries({ queryKey: KEY }); })} />
          ) : declining ? (
            <Button text="Decline request" buttonType="danger" size="lg" fullWidth disabled={!reason.trim()} loading={busy} onPress={() => void run(() => api.surety.decline(loanId, reason.trim()), () => { setDone('declined'); void qc.invalidateQueries({ queryKey: KEY }); })} />
          ) : (
            <View style={{ gap: space[4] }}>
              <Button text="Agree & sign with OTP" leftSlot={PenLine} size="lg" fullWidth loading={busy} onPress={() => void run(async () => setSigning(await api.surety.requestSign(loanId)))} />
              <Button text="Decline" buttonType="secondary" leftSlot={X} fullWidth onPress={() => setDeclining(true)} />
            </View>
          )
        ) : undefined
      }
    >
      {q.isLoading ? (
        <Skeleton height={300} radius={radius.card} />
      ) : !r ? (
        <Alert type="neutral" heading="This request is no longer open" description="The applicant may have chosen someone else, or withdrawn the loan." />
      ) : (
        <>
          {done === 'accepted' ? <Alert type="success" heading="Signed as surety" description={`${r.borrower.name} has been told. Thank you.`} /> : null}
          {done === 'declined' ? <Alert type="neutral" heading="Declined" description={`${r.borrower.name} will choose another surety.`} /> : null}
          {error ? <Alert type="error" heading="Not done" description={error} /> : null}
          <Card>
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
                <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
                  {r.loanNo ?? r.applicationNo}
                </Text>
                <StatusTag entity="surety" status={done === 'accepted' ? 'ACCEPTED' : done === 'declined' ? 'DECLINED' : r.myStatus} size="sm" />
              </View>
              <Text role="sectionTitle">{r.borrower.name}</Text>
              <Text role="caption" tone="secondary">
                No. {r.borrower.generalNo} · {r.borrower.designation} · {r.borrower.departmentName}
              </Text>
              <KeyValue label={r.productName} value={formatINR(r.amount)} emphasis />
              <KeyValue label="Repayment" value={`${r.instalments} months · EMI ${formatINR(r.emi)}`} />
              {r.otherSureties.length ? <KeyValue label="Other surety" value={r.otherSureties.map((s) => s.name).join(', ')} /> : null}
            </View>
          </Card>
          <Alert type="warning" heading="What being a surety means" description="If the borrower does not repay, the society may recover the dues from your salary." />

          <Section title="Your particulars (form item 9)" description="Filled from the society's records.">
            <Card>
              <KeyValue label="Date of birth" value={formatDisplayDate(r.me.dob)} />
              <KeyValue label="Substantive pay" value={formatINR(r.me.substantivePay)} />
              <KeyValue label="Shares held" value={String(r.me.numberOfShares)} />
              <KeyValue label="Retires on" value={`${formatDisplayDate(r.me.dor)} (${r.me.leftoverLabel} left)`} />
              {r.me.checks
                .filter((c) => !c.pass)
                .map((c, i) => (
                  <Text key={i} role="caption" tone={c.severity === 'block' ? 'danger' : 'warning'}>
                    {c.message}
                  </Text>
                ))}
            </Card>
          </Section>

          <Section title="Loans you already guarantee (item 10)">
            <Card>
              {r.me.guarantees.length ? (
                r.me.guarantees.map((g) => <KeyValue key={g.applicationNo} label={`${g.borrower} · ${g.product}`} value={formatINR(g.outstanding)} />)
              ) : (
                <Text role="body" tone="secondary">
                  None.
                </Text>
              )}
            </Card>
          </Section>

          <Section title="Undertaking (item 12)">
            <Card>
              <Text role="body">{r.declaration}</Text>
            </Card>
          </Section>

          {open && signing ? (
            <Card>
              <View style={{ gap: space[6] }}>
                <Text role="body">Enter the 6-digit code sent to your mobile to sign.</Text>
                {signing.demoOtp ? (
                  <Text role="caption" tone="tertiary">
                    Demo code: {signing.demoOtp}
                  </Text>
                ) : null}
                <OtpInput value={otp} onChange={setOtp} />
              </View>
            </Card>
          ) : null}
          {open && declining ? (
            <Card>
              <TextField label="Why are you declining?" value={reason} onChangeText={setReason} placeholder="e.g. Already a surety on two loans" multiline required />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
