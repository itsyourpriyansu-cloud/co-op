// MB-04 Loan details: stage tracker (labels per docs/06 v0.4, product-skipped steps hidden), amounts,
// sureties with their status, repayment schedule. Drafts can be continued or discarded here.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, PenLine, Repeat2, Search, Trash2, TrendingUp, Undo2 } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import { DocumentActions } from '@/components/DocumentActions';
import { api } from '@/lib/api';
import { DEFAULT_SOCIETY, documentFileName, localDate, sanctionLetterHtml, scheduleHtml } from '@/lib/documents';
import { useJoiningReference } from '@/lib/joining';
import { loanKeys, useMemberSearch, useMyLoan } from '@/lib/loans';
import { Banner, Button, Card, Divider, Header, MetadataListItem, OtpInput, Screen, Section, Skeleton, StageTracker, StatusToken, Text, TextField, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

export default function LoanDetails() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const loan = useMyLoan(id);
  const [allRows, setAllRows] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const search = useMemberSearch(q);
  const society = useJoiningReference().data?.society ?? DEFAULT_SOCIETY;
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [receipt, setReceipt] = useState<{ otpRef: string; demoOtp?: string } | null>(null);
  const [receiptOtp, setReceiptOtp] = useState('');
  const d = loan.data;
  const l = d?.loan;

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(undefined);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: loanKeys.one(id) });
      await qc.invalidateQueries({ queryKey: loanKeys.mine });
    } catch (e) {
      setActionError(isApiError(e) ? e.message : 'Something went wrong.');
    }
  };
  const canWithdraw = l ? ['SURETY_PENDING', 'ACCOUNTANT_REVIEW', 'RETURNED'].includes(l.status) : false;
  const canTopup = Boolean(l && d && l.status === 'ACTIVE' && d.product.topupAllowed);

  const discard = async () => {
    setDiscarding(true);
    try {
      await api.myLoans.discard(id);
      await qc.invalidateQueries({ queryKey: loanKeys.mine });
      router.back();
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <Screen header={<Header title={d?.product.name ?? 'Loan'} onBack={() => router.back()} />} refreshing={loan.isRefetching} onRefresh={() => void loan.refetch()}>
      {loan.isLoading ? (
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={140} radius={radius.container} />
          <Skeleton height={300} radius={radius.container} />
        </View>
      ) : loan.isError || !d || !l ? (
        <Banner status="error" heading="Couldn't load this loan" description="It may have been discarded. Pull to refresh or go back." />
      ) : (
        <>
          <Card>
            <View style={{ gap: spacing[2] }}>
              <View style={styles.row}>
                <Text type="supporting" tone="secondary" style={{ flex: 1 }}>
                  {l.loanNo ?? l.applicationNo}
                </Text>
                <StatusToken entity="loan" status={l.status} size="sm" />
              </View>
              <Text type="display-2">{formatINR(l.sanctionedAmount ?? l.appliedAmount)}</Text>
              <Text type="body" tone="secondary">
                {l.appliedInstalments} months at {l.ratePercent}% · {l.purpose || 'No purpose given yet'}
              </Text>
              {l.status !== 'DRAFT' && d.waitingOn ? (
                <Text type="supporting" tone="secondary">
                  Now with {d.waitingOn}
                </Text>
              ) : null}
            </View>
          </Card>

          {actionError ? <Banner status="error" heading="Not done" description={actionError} /> : null}
          {l.status === 'RETURNED' && l.returnInfo ? (
            <View style={{ gap: spacing[2] }}>
              <Banner status="warning" heading="The society needs a correction" description={l.returnInfo.reason} />
              <Button label="Correct & resubmit" icon={PenLine} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { draft: l.id } })} />
            </View>
          ) : null}
          {l.status === 'REJECTED' ? <Banner status="error" heading="Not approved" description={l.rejection?.remarks ?? 'The society did not approve this application.'} /> : null}
          {l.status === 'SANCTIONED' ? <Banner status="success" heading="Sanctioned" description={`Letter ${l.sanctionLetterNo ?? ''}. The money is paid out next.`} /> : null}
          {canTopup ? <Button label="Request a top-up" variant="secondary" icon={TrendingUp} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { topup: l.id } })} /> : null}

          {l.status === 'DRAFT' ? (
            <View style={{ gap: spacing[2] }}>
              <Banner status="neutral" heading="Not submitted yet" description="Finish the application and sign it with an OTP to send it." />
              <Button label="Continue application" icon={PenLine} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { draft: l.id } })} />
              <Button label="Discard draft" variant="secondary" icon={Trash2} fullWidth loading={discarding} onPress={() => void discard()} />
            </View>
          ) : null}

          <Section title="Progress">
            <Card>
              <StageTracker stages={d.stages.map((s) => ({ key: s.key, title: s.title, status: s.status, ...(s.date ? { date: formatDisplayDate(s.date) } : {}), ...(s.by ? { description: s.by } : {}) }))} />
            </Card>
          </Section>

          {l.disbursement && !l.receiptAck ? (
            <Section title="Confirm you received the money">
              <Card>
                <Text type="body">
                  {formatINR(l.disbursement.amount)} was paid on {formatDisplayDate(l.disbursement.date)}{l.disbursement.payee ? ` to ${l.disbursement.payee}, as you authorised` : ''}. Confirm you received it; this signs the loan receipt (form F7) with your signature on file.
                </Text>
                {receipt ? (
                  <>
                    {receipt.demoOtp ? <Text type="supporting" tone="secondary">Demo code: {receipt.demoOtp}</Text> : null}
                    <OtpInput value={receiptOtp} onChange={setReceiptOtp} />
                    <Button label="Confirm & sign" fullWidth disabled={receiptOtp.length !== 6} onPress={() => void run(async () => { await api.myLoans.confirmReceipt(l.id, receipt.otpRef, receiptOtp); setReceipt(null); })} />
                  </>
                ) : (
                  <Button label="I received it · sign with OTP" icon={PenLine} fullWidth onPress={() => void run(async () => setReceipt(await api.myLoans.requestReceipt(l.id)))} />
                )}
              </Card>
            </Section>
          ) : l.receiptAck ? (
            <Banner status="success" heading="Receipt confirmed" description={`You confirmed receiving the money on ${formatDisplayDate(l.receiptAck.at.slice(0, 10))}.`} />
          ) : null}

          <Section title="Amounts">
            <Card>
              <MetadataListItem label={l.emi ? 'Monthly instalment' : 'First instalment (estimate)'} value={formatINR(l.emi ?? d.preview.emi)} emphasis />
              <MetadataListItem label="Total interest" value={formatINR(d.preview.totalInterest)} />
              <MetadataListItem label="Share deposit deduction" value={formatINR(l.shareDepositDeduction ?? d.preview.shareDeduction)} />
              <MetadataListItem label="You receive" value={formatINR(l.netDisbursable ?? d.preview.netDisbursable)} />
              {l.status === 'ACTIVE' ? <MetadataListItem label="Outstanding" value={formatINR(l.outstandingPrincipal)} /> : null}
              {l.disbursedOn ? <MetadataListItem label="Paid out on" value={formatDisplayDate(l.disbursedOn)} /> : null}
            </Card>
          </Section>

          {d.sureties.length ? (
            <Section title="Sureties" description="They confirm in their own app.">
              <Card padded={false}>
                {d.sureties.map((s, i) => (
                  <View key={s.memberId} style={[styles.surety, i > 0 && styles.divider]}>
                    <View style={{ flex: 1, gap: spacing[0.5] }}>
                      <Text type="label">{s.name}</Text>
                      <Text type="supporting" tone="secondary">
                        No. {s.generalNo} · {s.departmentName}
                      </Text>
                      {s.declineReason ? (
                        <Text type="supporting" tone="error">
                          Declined: {s.declineReason}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing[1] }}>
                      {s.status ? <StatusToken entity="surety" status={s.status} size="xs" /> : null}
                      {s.status === 'DECLINED' && l.status === 'SURETY_PENDING' ? <Button label="Replace" size="sm" variant="secondary" icon={Repeat2} onPress={() => setReplacing(s.memberId)} /> : null}
                    </View>
                  </View>
                ))}
              </Card>
              {replacing ? (
                <Card>
                  <View style={{ gap: spacing[3] }}>
                    <TextField label="Choose another member" value={q} onChangeText={setQ} placeholder="Name or General No." />
                    {(search.data ?? [])
                      .filter((m) => !d.sureties.some((s) => s.memberId === m.id))
                      .slice(0, 6)
                      .map((m) => (
                        <Pressable
                          key={m.id}
                          accessibilityRole="button"
                          style={styles.result}
                          onPress={() =>
                            void run(async () => {
                              await api.myLoans.replaceSurety(l.id, replacing, m.id);
                              setReplacing(null);
                              setQ('');
                            })
                          }
                        >
                          <Search size={16} color={color.text.secondary} />
                          <View style={{ flex: 1 }}>
                            <Text type="label">{m.name}</Text>
                            <Text type="supporting" tone="secondary">
                              No. {m.generalNo} · {m.departmentName} · surety on {m.activeGuarantees}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    <Link label="Cancel" onPress={() => setReplacing(null)} />
                  </View>
                </Card>
              ) : null}
            </Section>
          ) : null}

          {l.sanctionLetterNo && l.sanctionSheet ? (
            <Section title="Sanction letter" description={`Ref. ${l.sanctionLetterNo}`}>
              <DocumentActions title={`Sanction letter ${l.sanctionLetterNo}`} fileName={documentFileName('Sanction-letter', l.sanctionLetterNo)} html={() => sanctionLetterHtml(d, { society, generatedOn: localDate() })} />
            </Section>
          ) : null}

          {l.schedule.length ? (
            <Section title="Repayment schedule">
              <Card>
                <View style={{ gap: spacing[2] }}>
                  {(allRows ? l.schedule : l.schedule.slice(0, 6)).map((r) => (
                    <View key={r.installmentNo} style={styles.row}>
                      <Text type="body" style={{ flex: 1 }}>
                        {formatCycle(r.dueCycle)}
                      </Text>
                      <Text type="body" weight="medium">{formatINR(r.emi)}</Text>
                      {r.paidStatus ? <StatusToken entity="schedule" status={r.paidStatus} size="xs" /> : null}
                    </View>
                  ))}
                  {l.schedule[0]?.earlyInterest ? (
                    <Text type="supporting" tone="secondary">
                      The first instalment includes {formatINR(l.schedule[0].earlyInterest)} interest for the days between the loan being paid and the 1st of {formatCycle(l.schedule[0].dueCycle)}.
                    </Text>
                  ) : null}
                  {l.schedule.length > 6 ? (
                    <>
                      <Divider />
                      <Link label={allRows ? 'Show less' : `Show all ${l.schedule.length} months`} iconEnd={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} />
                    </>
                  ) : null}
                </View>
              </Card>
              <DocumentActions title={`Repayment schedule ${l.loanNo ?? l.applicationNo}`} fileName={documentFileName('Repayment-schedule', l.loanNo ?? l.applicationNo)} html={() => scheduleHtml(d, { society, generatedOn: localDate() })} />
            </Section>
          ) : null}

          {d.checks.some((c) => !c.pass) && l.status !== 'DRAFT' ? (
            <Section title="Points the office will look at">
              <Card>
                <View style={{ gap: spacing[1.5] }}>
                  {d.checks
                    .filter((c) => !c.pass)
                    .map((c, i) => (
                      <Text key={i} type="supporting" tone={c.severity === 'block' ? 'error' : 'warning'}>
                        {c.message}
                      </Text>
                    ))}
                </View>
              </Card>
            </Section>
          ) : null}
          {canWithdraw ? (
            confirmWithdraw ? (
              <View style={{ gap: spacing[2] }}>
                <Banner status="warning" heading="Withdraw this application?" description="It stops here. You can apply again later." />
                <Button label="Yes, withdraw" variant="destructive" fullWidth onPress={() => void run(() => api.myLoans.withdraw(l.id))} />
                <Button label="Keep it" variant="secondary" fullWidth onPress={() => setConfirmWithdraw(false)} />
              </View>
            ) : (
              <Button label="Withdraw application" variant="secondary" icon={Undo2} fullWidth onPress={() => setConfirmWithdraw(true)} />
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  surety: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
});
