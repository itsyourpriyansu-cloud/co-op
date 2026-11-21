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
import { DocumentActions } from '@/components/DocumentActions';
import { Logo } from '@/components/Logo';
import { DEFAULT_SOCIETY, documentFileName, fdrHtml, localDate } from '@/lib/documents';
import { useJoiningReference } from '@/lib/joining';
import { api } from '@/lib/api';
import { PAYOUT_LABEL, SCHEME_LABEL, depositKeys, useDepositContext, useMyDeposit } from '@/lib/deposits';
import { Banner, Button, Card, Divider, Header, MetadataListItem, Screen, Section, Skeleton, StageTracker, StatusToken, Text, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

const IN_REQUEST = ['REQUESTED', 'PAYMENT_RECEIVED', 'ACCEPTANCE_SECRETARY', 'ACCEPTANCE_PRESIDENT'];

export default function DepositDetails() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useMyDeposit(id);
  const ctx = useDepositContext();
  const society = useJoiningReference().data?.society ?? DEFAULT_SOCIETY;
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
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={150} radius={radius.container} />
          <Skeleton height={260} radius={radius.container} />
        </View>
      ) : q.isError || !d || !dep ? (
        <Banner status="error" heading="Couldn't load this deposit" description="Pull to refresh or go back." />
      ) : (
        <>
          <Card>
            <View style={{ gap: spacing[2] }}>
              <View style={styles.row}>
                <Text type="supporting" tone="secondary" style={{ flex: 1 }}>
                  {dep.fdrNo ?? dep.accountNo}
                </Text>
                <StatusToken entity="deposit" status={dep.status} size="sm" />
              </View>
              <Text type="display-2">{formatINR(isFd ? (dep.principal ?? 0) : dep.balance)}</Text>
              <Text type="body" tone="secondary">
                {isFd ? `${dep.tenureMonths} months at ${dep.ratePercent}% · interest ${PAYOUT_LABEL[dep.payoutFrequency ?? 'ON_MATURITY'].toLowerCase()}` : `${dep.ratePercent}% a year${dep.monthlyAmount ? ` · ${formatINR(dep.monthlyAmount)} a month from salary` : ''}`}
              </Text>
              {d.waitingOn && inRequest && dep.status !== 'REQUESTED' ? (
                <Text type="supporting" tone="secondary">
                  Now with {d.waitingOn}
                </Text>
              ) : null}
            </View>
          </Card>

          {error ? <Banner status="error" heading="Not done" description={error} /> : null}

          {dep.status === 'REQUESTED' ? (
            <Banner
              status="warning"
              heading={`Pay ${formatINR(dep.principal ?? 0)} to start your FD`}
              description={ctx.data ? `At the society counter (${ctx.data.payTo.counter}), or by transfer to ${ctx.data.payTo.accountName}, A/c ${ctx.data.payTo.accountNo}, IFSC ${ctx.data.payTo.ifsc}. Quote ${dep.accountNo}.` : `Pay at the society counter and quote ${dep.accountNo}.`}
            />
          ) : null}
          {dep.status === 'REFUND_PENDING' ? <Banner status="error" heading="Not accepted" description={`${dep.rejection?.remarks ?? 'The society did not accept this deposit.'} Your money will be refunded at the counter.`} /> : null}
          {dep.status === 'CANCELLED' ? <Banner status="neutral" heading="Cancelled" description={dep.cancelledReason ?? 'This request was cancelled.'} /> : null}
          {dep.status === 'MATURED' ? <Banner status="info" heading="Matured" description="Interest stopped on the maturity date. Visit the office to renew or withdraw." /> : null}

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
                <MetadataListItem label="Matures on" value={formatDisplayDate(d.maturity.date)} />
                <MetadataListItem label="Maturity value" value={formatINR(d.maturity.value)} emphasis />
                <MetadataListItem label="Total interest" value={formatINR(d.maturity.totalInterest)} />
                {d.maturity.periodicInterest ? <MetadataListItem label={`Paid ${PAYOUT_LABEL[dep.payoutFrequency ?? 'ON_MATURITY'].toLowerCase()}`} value={formatINR(d.maturity.periodicInterest)} /> : null}
              </Card>
            </Section>
          ) : null}

          {isFd && dep.fdrNo && ['ACTIVE', 'MATURED', 'CLOSED'].includes(dep.status) ? (
            <Section title="Fixed Deposit Receipt">
              <View style={styles.fdr}>
                <View style={styles.row}>
                  <Logo size={40} />
                  <View style={{ flex: 1 }}>
                    <Text type="label">TGSECCSL · Regd. No. P-929</Text>
                    <Text type="supporting" tone="secondary">
                      {dep.fdrNo}
                    </Text>
                  </View>
                </View>
                <Divider />
                <MetadataListItem label="Depositor" value={d.member.name} />
                <MetadataListItem label="Amount" value={formatINR(dep.principal ?? 0)} />
                <MetadataListItem label="Deposited on" value={formatDisplayDate(dep.openedOn)} />
                <MetadataListItem label="Period" value={`${dep.tenureMonths} months at ${dep.ratePercent}%`} />
                {dep.maturityDate ? <MetadataListItem label="Matures on" value={formatDisplayDate(dep.maturityDate)} /> : null}
                {dep.signOffs?.secretary ? <MetadataListItem label="Accepted by the Secretary" value={`${dep.signOffs.secretary.byName} · ${formatDisplayDate(dep.signOffs.secretary.at.slice(0, 10))}`} /> : null}
                {dep.signOffs?.president ? <MetadataListItem label="Accepted by the President" value={`${dep.signOffs.president.byName} · ${formatDisplayDate(dep.signOffs.president.at.slice(0, 10))}`} /> : null}
                <Text type="supporting" tone="secondary">
                  Show this receipt at the counter when the deposit matures. The office can print the full FDR.
                </Text>
              </View>
              <DocumentActions title={`FDR ${dep.fdrNo}`} fileName={documentFileName('FDR', dep.fdrNo)} html={() => fdrHtml(d, { society, ...(dep.payoutFrequency ? { payout: PAYOUT_LABEL[dep.payoutFrequency] } : {}), generatedOn: localDate() })} />
            </Section>
          ) : null}

          {d.pledgedLoan ? <Banner status="info" heading="Pledged to a loan" description={`Security for loan ${d.pledgedLoan.loanNo}, ${formatINR(d.pledgedLoan.outstanding)} outstanding. It is released when the loan is repaid.`} /> : null}
          {d.loanAgainst && dep.status === 'ACTIVE' && !d.pledgedLoan ? (
            <Card>
              <View style={{ gap: spacing[2] }}>
                <Text type="label">Need money before maturity?</Text>
                <Text type="supporting" tone="secondary">
                  Borrow up to {formatINR(d.loanAgainst.maxAmount)} ({d.loanAgainst.marginPercent}% of this FD) without breaking it. The FD stays as security.
                </Text>
                <Button label="Take a loan against this FD" icon={HandCoins} fullWidth onPress={() => router.push({ pathname: '/loan/apply', params: { pledge: dep.id } })} />
              </View>
            </Card>
          ) : null}

          {d.payouts.length ? (
            <Section title="Interest payouts">
              <Card>
                <View style={{ gap: spacing[2] }}>
                  {(allRows ? d.payouts : d.payouts.slice(0, 6)).map((p) => (
                    <View key={p.date} style={styles.row}>
                      <Text type="body" style={{ flex: 1 }}>
                        {formatDisplayDate(p.date)}
                      </Text>
                      <Text type="body" weight="medium">{formatINR(p.amount)}</Text>
                      <Text type="supporting" tone={p.paid ? 'success' : 'secondary'}>
                        {p.paid ? 'Paid' : 'Due'}
                      </Text>
                    </View>
                  ))}
                  {d.payouts.length > 6 ? <Link label={allRows ? 'Show less' : `Show all ${d.payouts.length}`} iconEnd={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} /> : null}
                </View>
              </Card>
            </Section>
          ) : null}

          {isFd && (dep.holders?.length || dep.minor || dep.nominee) ? (
            <Section title="Holders & nominee">
              <Card>
                <MetadataListItem label="First holder" value={d.member.name} />
                {(dep.holders ?? []).map((h, i) => (
                  <MetadataListItem key={i} label={`Joint holder ${i + 1}`} value={h.name} />
                ))}
                {dep.minor ? <MetadataListItem label="On behalf of minor" value={`${dep.minor.name} (born ${formatDisplayDate(dep.minor.dob)})`} /> : null}
                {dep.operationMode !== 'SINGLE' ? <MetadataListItem label="Can be operated by" value={dep.operationMode === 'EITHER_OR_SURVIVOR' ? 'Either or survivor' : 'Any one or survivor'} /> : null}
                {dep.nominee ? <MetadataListItem label="Nominee" value={`${dep.nominee.name} (${dep.nominee.relation})`} /> : null}
              </Card>
            </Section>
          ) : null}

          {!isFd && d.ledger.length ? (
            <Section title="Statement" description="Latest first">
              <Card>
                <View style={{ gap: spacing[2] }}>
                  {[...d.ledger]
                    .reverse()
                    .slice(0, allRows ? undefined : 8)
                    .map((r, i) => (
                      <View key={i} style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text type="body">{r.particulars}</Text>
                          <Text type="supporting" tone="secondary">
                            {formatDisplayDate(r.date)}
                          </Text>
                        </View>
                        <Text type="body" weight="medium" tone={r.debit ? 'debit' : 'credit'}>
                          {r.debit ? `−${formatINR(r.debit)}` : `+${formatINR(r.credit ?? 0)}`}
                        </Text>
                      </View>
                    ))}
                  {d.ledger.length > 8 ? <Link label={allRows ? 'Show less' : `Show all ${d.ledger.length}`} iconEnd={allRows ? ChevronUp : ChevronDown} onPress={() => setAllRows((v) => !v)} /> : null}
                </View>
              </Card>
            </Section>
          ) : null}

          {dep.status === 'REQUESTED' ? (
            confirmCancel ? (
              <View style={{ gap: spacing[2] }}>
                <Banner status="warning" heading="Cancel this request?" description="Nothing has been paid yet, so nothing is refunded. You can request again later." />
                <Button label="Yes, cancel" variant="destructive" fullWidth loading={busy} onPress={() => void cancel()} />
                <Button label="Keep it" variant="secondary" fullWidth onPress={() => setConfirmCancel(false)} />
              </View>
            ) : (
              <Button label="Cancel request" variant="secondary" icon={Undo2} fullWidth onPress={() => setConfirmCancel(true)} />
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  fdr: { gap: spacing[2], padding: spacing[4], borderRadius: radius.container, borderWidth: 1, borderColor: color.accent, backgroundColor: color.background.surface },
});
