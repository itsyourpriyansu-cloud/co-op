// MB-04 Loan details: stage tracker (labels per docs/06 v0.4, product-skipped steps hidden), amounts,
// sureties with their status, repayment schedule. Drafts can be continued or discarded here.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, PenLine, Repeat2, Search, Trash2, TrendingUp, Undo2 } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import { api } from '@/lib/api';
import { loanKeys, useMemberSearch, useMyLoan } from '@/lib/loans';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, Skeleton, StageTracker, StatusTag, Text, TextField } from '@/ui';
import { color, radius, space } from '@/theme';

export default function LoanDetails() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const loan = useMyLoan(id);
  const [allRows, setAllRows] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const search = useMemberSearch(q);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [actionError, setActionError] = useState<string>();
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
        <View style={{ gap: space[8] }}>
          <Skeleton height={140} radius={radius.card} />
          <Skeleton height={300} radius={radius.card} />
        </View>
      ) : loan.isError || !d || !l ? (
        <Alert type="error" heading="Couldn't load this loan" description="It may have been discarded. Pull to refresh or go back." />
      ) : (
        <>
          <Card>
            <View style={{ gap: space[4] }}>
              <View style={styles.row}>
                <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
                  {l.loanNo ?? l.applicationNo}
                </Text>
                <StatusTag entity="loan" status={l.status} size="sm" />
              </View>
              <Text role="display">{formatINR(l.sanctionedAmount ?? l.appliedAmount)}</Text>
              <Text role="body" tone="secondary">
                {l.appliedInstalments} months at {l.ratePercent}% · {l.purpose || 'No purpose given yet'}
              </Text>
              {l.status !== 'DRAFT' && d.waitingOn ? (
                <Text role="caption" tone="secondary">
                  Now with {d.waitingOn}
                </Text>
              ) : null}
            </View>
          </Card>

          {actionError ? <Alert type="error" heading="Not done" description={actionError} /> : null}
          {l.status === 'RETURNED' && l.returnInfo ? (
            <View style={{ gap: space[4] }}>
              <Alert type="warning" heading="The society needs a correction" description={l.returnInfo.reason} />
              <Button text="Correct & resubmit" leftSlot={PenLine} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { draft: l.id } })} />
            </View>
          ) : null}
          {l.status === 'REJECTED' ? <Alert type="error" heading="Not approved" description={l.rejection?.remarks ?? 'The society did not approve this application.'} /> : null}
          {l.status === 'SANCTIONED' ? <Alert type="success" heading="Sanctioned" description={`Letter ${l.sanctionLetterNo ?? ''}. The money is paid out next.`} /> : null}
          {canTopup ? <Button text="Request a top-up" buttonType="secondary" leftSlot={TrendingUp} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { topup: l.id } })} /> : null}

          {l.status === 'DRAFT' ? (
            <View style={{ gap: space[4] }}>
              <Alert type="neutral" heading="Not submitted yet" description="Finish the application and sign it with an OTP to send it." />
              <Button text="Continue application" leftSlot={PenLine} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { draft: l.id } })} />
              <Button text="Discard draft" buttonType="secondary" leftSlot={Trash2} fullWidth loading={discarding} onPress={() => void discard()} />
            </View>
          ) : null}

          <Section title="Progress">
            <Card>
              <StageTracker stages={d.stages.map((s) => ({ key: s.key, title: s.title, status: s.status, ...(s.date ? { date: formatDisplayDate(s.date) } : {}), ...(s.by ? { description: s.by } : {}) }))} />
            </Card>
          </Section>

          <Section title="Amounts">
            <Card>
              <KeyValue label={l.emi ? 'Monthly instalment' : 'First instalment (estimate)'} value={formatINR(l.emi ?? d.preview.emi)} emphasis />
              <KeyValue label="Total interest" value={formatINR(d.preview.totalInterest)} />
              <KeyValue label="Share deposit deduction" value={formatINR(l.shareDepositDeduction ?? d.preview.shareDeduction)} />
              <KeyValue label="You receive" value={formatINR(l.netDisbursable ?? d.preview.netDisbursable)} />
              {l.status === 'ACTIVE' ? <KeyValue label="Outstanding" value={formatINR(l.outstandingPrincipal)} /> : null}
              {l.disbursedOn ? <KeyValue label="Paid out on" value={formatDisplayDate(l.disbursedOn)} /> : null}
            </Card>
          </Section>

          {d.sureties.length ? (
            <Section title="Sureties" description="They confirm in their own app.">
              <Card padded={false}>
                {d.sureties.map((s, i) => (
                  <View key={s.memberId} style={[styles.surety, i > 0 && styles.divider]}>
                    <View style={{ flex: 1, gap: space[1] }}>
                      <Text role="label">{s.name}</Text>
                      <Text role="caption" tone="tertiary">
                        No. {s.generalNo} · {s.departmentName}
                      </Text>
                      {s.declineReason ? (
                        <Text role="caption" tone="danger">
                          Declined: {s.declineReason}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space[2] }}>
                      {s.status ? <StatusTag entity="surety" status={s.status} size="xs" /> : null}
                      {s.status === 'DECLINED' && l.status === 'SURETY_PENDING' ? <Button text="Replace" size="sm" buttonType="secondary" leftSlot={Repeat2} onPress={() => setReplacing(s.memberId)} /> : null}
                    </View>
                  </View>
                ))}
              </Card>
              {replacing ? (
                <Card>
                  <View style={{ gap: space[6] }}>
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
                          <Search size={16} color={color.text.tertiary} />
                          <View style={{ flex: 1 }}>
                            <Text role="label">{m.name}</Text>
                            <Text role="caption" tone="tertiary">
                              No. {m.generalNo} · {m.departmentName} · surety on {m.activeGuarantees}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    <Button text="Cancel" buttonType="secondary" size="sm" subType="inline" onPress={() => setReplacing(null)} />
                  </View>
                </Card>
              ) : null}
            </Section>
          ) : null}

          {l.schedule.length ? (
            <Section title="Repayment schedule">
              <Card>
                <View style={{ gap: space[4] }}>
                  {(allRows ? l.schedule : l.schedule.slice(0, 6)).map((r) => (
                    <View key={r.installmentNo} style={styles.row}>
                      <Text role="body" style={{ flex: 1 }}>
                        {formatCycle(r.dueCycle)}
                      </Text>
                      <Text role="bodyStrong">{formatINR(r.emi)}</Text>
                      {r.paidStatus ? <StatusTag entity="schedule" status={r.paidStatus} size="xs" /> : null}
                    </View>
                  ))}
                  {l.schedule.length > 6 ? (
                    <>
                      <Divider />
                      <Button text={allRows ? 'Show less' : `Show all ${l.schedule.length} months`} buttonType="secondary" size="sm" subType="inline" rightSlot={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} />
                    </>
                  ) : null}
                </View>
              </Card>
            </Section>
          ) : null}

          {d.checks.some((c) => !c.pass) && l.status !== 'DRAFT' ? (
            <Section title="Points the office will look at">
              <Card>
                <View style={{ gap: space[3] }}>
                  {d.checks
                    .filter((c) => !c.pass)
                    .map((c, i) => (
                      <Text key={i} role="caption" tone={c.severity === 'block' ? 'danger' : 'warning'}>
                        {c.message}
                      </Text>
                    ))}
                </View>
              </Card>
            </Section>
          ) : null}
          {canWithdraw ? (
            confirmWithdraw ? (
              <View style={{ gap: space[4] }}>
                <Alert type="warning" heading="Withdraw this application?" description="It stops here. You can apply again later." />
                <Button text="Yes, withdraw" buttonType="danger" fullWidth onPress={() => void run(() => api.myLoans.withdraw(l.id))} />
                <Button text="Keep it" buttonType="secondary" fullWidth onPress={() => setConfirmWithdraw(false)} />
              </View>
            ) : (
              <Button text="Withdraw application" buttonType="secondary" leftSlot={Undo2} fullWidth onPress={() => setConfirmWithdraw(true)} />
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  surety: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[8], paddingVertical: space[6] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  result: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingVertical: space[4] },
});
