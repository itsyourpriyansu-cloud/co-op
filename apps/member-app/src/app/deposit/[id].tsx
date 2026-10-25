// MB-09 Deposit details. FD request: how to pay, the acceptance tracker (Requested → Payment →
// Secretary → President) and cancel while unpaid. Accepted FD: maturity, payouts, holders, the FDR and
// "Take a loan against this FD" (D-045, BR-015). CRD / SRDS / Savings: balance and ledger.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, HandCoins, Undo2 } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import { Logo } from '@/components/Logo';
import { api } from '@/lib/api';
import { PAYOUT_LABEL, SCHEME_LABEL, depositKeys, useDepositContext, useMyDeposit } from '@/lib/deposits';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, Skeleton, StageTracker, StatusTag, Text } from '@/ui';
import { color, radius, space } from '@/theme';

const IN_REQUEST = ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT'];

export default function DepositDetails() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useMyDeposit(id);
  const ctx = useDepositContext();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [allRows, setAllRows] = useState(false);
  const d = q.data;
  const dep = d?.deposit;
  const isFd = dep?.scheme === 'FD';
  const inRequest = dep ? IN_REQUEST.includes(dep.status) : false;

  const cancel = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.myDeposits.cancel(id, 'Cancelled by the member');
      await qc.invalidateQueries({ queryKey: depositKeys.one(id) });
      await qc.invalidateQueries({ queryKey: depositKeys.mine });
      setConfirmCancel(false);
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not cancel. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title={dep ? (isFd ? 'Fixed deposit' : SCHEME_LABEL[dep.scheme]) : 'Deposit'} onBack={() => router.back()} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <View style={{ gap: space[8] }}>
          <Skeleton height={150} radius={radius.card} />
          <Skeleton height={260} radius={radius.card} />
        </View>
      ) : q.isError || !d || !dep ? (
        <Alert type="error" heading="Couldn't load this deposit" description="Pull to refresh or go back." />
      ) : (
        <>
          <Card>
            <View style={{ gap: space[4] }}>
              <View style={styles.row}>
                <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
                  {dep.fdrNo ?? dep.accountNo}
                </Text>
                <StatusTag entity="deposit" status={dep.status} size="sm" />
              </View>
              <Text role="display">{formatINR(isFd ? (dep.principal ?? 0) : dep.balance)}</Text>
              <Text role="body" tone="secondary">
                {isFd ? `${dep.tenureMonths} months at ${dep.ratePercent}% · interest ${PAYOUT_LABEL[dep.payoutFrequency ?? 'ON_MATURITY'].toLowerCase()}` : `${dep.ratePercent}% a year${dep.monthlyAmount ? ` · ${formatINR(dep.monthlyAmount)} a month from salary` : ''}`}
              </Text>
              {d.waitingOn && inRequest && dep.status !== 'REQUESTED' ? (
                <Text role="caption" tone="secondary">
                  Now with {d.waitingOn}
                </Text>
              ) : null}
            </View>
          </Card>

          {error ? <Alert type="error" heading="Not done" description={error} /> : null}

          {dep.status === 'REQUESTED' ? (
            <Alert
              type="warning"
              heading={`Pay ${formatINR(dep.principal ?? 0)} to start your FD`}
              description={ctx.data ? `At the society counter (${ctx.data.payTo.counter}), or by transfer to ${ctx.data.payTo.accountName}, A/c ${ctx.data.payTo.accountNo}, IFSC ${ctx.data.payTo.ifsc}. Quote ${dep.accountNo}.` : `Pay at the society counter and quote ${dep.accountNo}.`}
            />
          ) : null}
          {dep.status === 'REFUND_PENDING' ? <Alert type="error" heading="Not accepted" description={`${dep.rejection?.remarks ?? 'The society did not accept this deposit.'} Your money will be refunded at the counter.`} /> : null}
          {dep.status === 'CANCELLED' ? <Alert type="neutral" heading="Cancelled" description={dep.cancelledReason ?? 'This request was cancelled.'} /> : null}
          {dep.status === 'MATURED' ? <Alert type="primary" heading="Matured" description="Interest stopped on the maturity date. Visit the office to renew or withdraw." /> : null}

          {isFd && (inRequest || dep.status === 'REFUND_PENDING') ? (
            <Section title="Progress">
              <Card>
                <StageTracker stages={d.stages.map((s) => ({ key: s.key, title: s.title, status: s.status, ...(s.date ? { date: formatDisplayDate(s.date) } : {}), ...(s.by ? { description: s.by } : {}) }))} />
              </Card>
            </Section>
          ) : null}

          {isFd && d.maturity ? (
            <Section title={inRequest ? 'What you will get' : 'Maturity'}>
              <Card>
                <KeyValue label="Matures on" value={formatDisplayDate(d.maturity.date)} />
                <KeyValue label="Maturity value" value={formatINR(d.maturity.value)} emphasis />
                <KeyValue label="Total interest" value={formatINR(d.maturity.totalInterest)} />
                {d.maturity.periodicInterest ? <KeyValue label={`Paid ${PAYOUT_LABEL[dep.payoutFrequency ?? 'ON_MATURITY'].toLowerCase()}`} value={formatINR(d.maturity.periodicInterest)} /> : null}
              </Card>
            </Section>
          ) : null}

          {isFd && dep.fdrNo && ['ACTIVE', 'MATURED', 'CLOSED'].includes(dep.status) ? (
            <Section title="Fixed Deposit Receipt">
              <View style={styles.fdr}>
                <View style={styles.row}>
                  <Logo size={40} />
                  <View style={{ flex: 1 }}>
                    <Text role="label">TGSECCSL · Regd. No. P-929</Text>
                    <Text role="caption" tone="tertiary">
                      {dep.fdrNo}
                    </Text>
                  </View>
                </View>
                <Divider />
                <KeyValue label="Depositor" value={d.member.name} />
                <KeyValue label="Amount" value={formatINR(dep.principal ?? 0)} />
                <KeyValue label="Deposited on" value={formatDisplayDate(dep.openedOn)} />
                <KeyValue label="Period" value={`${dep.tenureMonths} months at ${dep.ratePercent}%`} />
                {dep.maturityDate ? <KeyValue label="Matures on" value={formatDisplayDate(dep.maturityDate)} /> : null}
                {dep.signOffs?.secretary ? <KeyValue label="Accepted by the Secretary" value={`${dep.signOffs.secretary.byName} · ${formatDisplayDate(dep.signOffs.secretary.at.slice(0, 10))}`} /> : null}
                {dep.signOffs?.president ? <KeyValue label="Accepted by the President" value={`${dep.signOffs.president.byName} · ${formatDisplayDate(dep.signOffs.president.at.slice(0, 10))}`} /> : null}
                <Text role="caption" tone="tertiary">
                  Show this receipt at the counter when the deposit matures. The office can print the full FDR.
                </Text>
              </View>
            </Section>
          ) : null}

          {d.pledgedLoan ? <Alert type="primary" heading="Pledged to a loan" description={`Security for loan ${d.pledgedLoan.loanNo}, ${formatINR(d.pledgedLoan.outstanding)} outstanding. It is released when the loan is repaid.`} /> : null}
          {d.loanAgainst && dep.status === 'ACTIVE' && !d.pledgedLoan ? (
            <Card>
              <View style={{ gap: space[4] }}>
                <Text role="label">Need money before maturity?</Text>
                <Text role="caption" tone="secondary">
                  Borrow up to {formatINR(d.loanAgainst.maxAmount)} ({d.loanAgainst.marginPercent}% of this FD) without breaking it. The FD stays as security.
                </Text>
                <Button text="Take a loan against this FD" leftSlot={HandCoins} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { pledge: dep.id } })} />
              </View>
            </Card>
          ) : null}

          {d.payouts.length ? (
            <Section title="Interest payouts">
              <Card>
                <View style={{ gap: space[4] }}>
                  {(allRows ? d.payouts : d.payouts.slice(0, 6)).map((p) => (
                    <View key={p.date} style={styles.row}>
                      <Text role="body" style={{ flex: 1 }}>
                        {formatDisplayDate(p.date)}
                      </Text>
                      <Text role="bodyStrong">{formatINR(p.amount)}</Text>
                      <Text role="caption" tone={p.paid ? 'success' : 'tertiary'}>
                        {p.paid ? 'Paid' : 'Due'}
                      </Text>
                    </View>
                  ))}
                  {d.payouts.length > 6 ? <Button text={allRows ? 'Show less' : `Show all ${d.payouts.length}`} buttonType="secondary" size="sm" subType="inline" rightSlot={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} /> : null}
                </View>
              </Card>
            </Section>
          ) : null}

          {isFd && (dep.holders?.length || dep.minor || dep.nominee) ? (
            <Section title="Holders & nominee">
              <Card>
                <KeyValue label="First holder" value={d.member.name} />
                {(dep.holders ?? []).map((h, i) => (
                  <KeyValue key={i} label={`Joint holder ${i + 1}`} value={h.name} />
                ))}
                {dep.minor ? <KeyValue label="On behalf of minor" value={`${dep.minor.name} (born ${formatDisplayDate(dep.minor.dob)})`} /> : null}
                {dep.operationMode !== 'SINGLE' ? <KeyValue label="Can be operated by" value={dep.operationMode === 'EITHER_OR_SURVIVOR' ? 'Either or survivor' : 'Any one or survivor'} /> : null}
                {dep.nominee ? <KeyValue label="Nominee" value={`${dep.nominee.name} (${dep.nominee.relation})`} /> : null}
              </Card>
            </Section>
          ) : null}

          {!isFd && d.ledger.length ? (
            <Section title="Statement" description="Latest first">
              <Card>
                <View style={{ gap: space[4] }}>
                  {[...d.ledger]
                    .reverse()
                    .slice(0, allRows ? undefined : 8)
                    .map((r, i) => (
                      <View key={i} style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text role="body">{r.particulars}</Text>
                          <Text role="caption" tone="tertiary">
                            {formatDisplayDate(r.date)}
                          </Text>
                        </View>
                        <Text role="bodyStrong" tone={r.debit ? 'debit' : 'credit'}>
                          {r.debit ? `−${formatINR(r.debit)}` : `+${formatINR(r.credit ?? 0)}`}
                        </Text>
                      </View>
                    ))}
                  {d.ledger.length > 8 ? <Button text={allRows ? 'Show less' : `Show all ${d.ledger.length}`} buttonType="secondary" size="sm" subType="inline" rightSlot={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} /> : null}
                </View>
              </Card>
            </Section>
          ) : null}

          {dep.status === 'REQUESTED' ? (
            confirmCancel ? (
              <View style={{ gap: space[4] }}>
                <Alert type="warning" heading="Cancel this request?" description="Nothing has been paid yet, so nothing is refunded. You can request again later." />
                <Button text="Yes, cancel" buttonType="danger" fullWidth loading={busy} onPress={() => void cancel()} />
                <Button text="Keep it" buttonType="secondary" fullWidth onPress={() => setConfirmCancel(false)} />
              </View>
            ) : (
              <Button text="Cancel request" buttonType="secondary" leftSlot={Undo2} fullWidth onPress={() => setConfirmCancel(true)} />
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  fdr: { gap: space[4], padding: space[8], borderRadius: radius.card, borderWidth: 1, borderColor: color.brand.border, backgroundColor: color.bg.surface },
});
