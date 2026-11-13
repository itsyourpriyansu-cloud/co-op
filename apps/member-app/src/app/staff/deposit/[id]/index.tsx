// ST-32m Deposit detail: the FD request stages, accepted FDs with maturity and payouts, and the ledger for every scheme.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate, formatDisplayDateTime, formatINR, minorMajorityDate } from '@tgs/domain';
import type { DepositDetail } from '@tgs/types';
import { Expand, Loaded, PrintButton } from '@/components/staff';
import { api } from '@/lib/api';
import { ACTION_LABEL, isSecondary, METHOD, MODE, PAYOUT, SCHEME } from '@/lib/staffDeposits';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, StageTracker, StatusTag, Tag, Text } from '@/ui';
import { space } from '@/theme';

export default function DepositDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id), refetchInterval: 20_000 });
  return (
    <Loaded page q={q} what="this deposit">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function Body({ d, refetching, refetch }: { d: DepositDetail; refetching: boolean; refetch: () => void }) {
  const dep = d.deposit;
  const isFd = dep.scheme === 'FD';
  const primary = d.actions.filter((a) => !isSecondary(a));
  const secondary = d.actions.filter(isSecondary);
  const open = (a: string) => router.push(`/staff/deposit/${dep.id}/${a}`);
  const pw = dep.prematureWithdrawal;

  return (
    <Screen
      header={<Header title="Deposit" onBack={() => router.back()} />}
      refreshing={refetching}
      onRefresh={refetch}
      {...(d.actions.length
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                {primary.map((a) => (
                  <Button key={a} text={ACTION_LABEL[a] ?? a} size="lg" fullWidth onPress={() => open(a)} />
                ))}
                {secondary.length ? (
                  <View style={{ flexDirection: 'row', gap: space[4] }}>
                    {secondary.map((a) => (
                      <Button key={a} text={ACTION_LABEL[a] ?? a} buttonType="secondary" style={{ flex: 1 }} onPress={() => open(a)} />
                    ))}
                  </View>
                ) : null}
              </View>
            ),
          }
        : {})}
    >
      <View style={{ gap: space[2] }}>
        <Text role="pageTitle">
          {SCHEME[dep.scheme]} · {formatINR(isFd ? (dep.principal ?? 0) : dep.balance)}
        </Text>
        <Text role="caption" tone="secondary">
          {dep.fdrNo ?? dep.accountNo} · {d.member.departmentName}
        </Text>
        <Button text={`${d.member.name} (No. ${d.member.generalNo})`} subType="inline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push(`/staff/member/${d.member.id}`)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          <StatusTag entity="deposit" status={dep.status} audience="staff" />
          {dep.pledgedToLoanId ? <Tag text="Pledged" color="purple" /> : null}
        </View>
      </View>

      {dep.status === 'REFUND_PENDING' ? <Alert type="warning" heading={`Not accepted by ${dep.rejection?.byName ?? ''}`} description={`${dep.rejection?.remarks ?? ''} The Cashier refunds the money.`} /> : null}
      {pw ? <Alert type="neutral" heading={`Withdrawn early on ${formatDisplayDate(pw.date)} by ${pw.byName}`} description={`Paid ${formatINR(pw.payable)}: principal ${formatINR(pw.principal)} + interest ${formatINR(pw.interestPayable)} (penalty ${formatINR(pw.penalty)}, ${pw.penaltyPercent}${pw.method === 'RATE_CUT' ? ' points' : '%'} ${METHOD[pw.method]}).`} /> : null}
      {dep.status === 'CANCELLED' ? <Alert type="neutral" heading="Cancelled" description={dep.cancelledReason ?? ''} /> : null}

      <Section title="Next step">
        <Card>
          {d.actions.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
              <Tag text="Your turn" color="primary" />
              <Text role="label">{primary.map((a) => ACTION_LABEL[a] ?? a).join(' or ')}</Text>
            </View>
          ) : (
            <Text role="body" tone="secondary">
              {d.waitingOn ? `Waiting on ${d.waitingOn}` : dep.status === 'ACTIVE' ? 'Running. Interest is paid as chosen; the FDR is with the member.' : 'No further steps.'}
            </Text>
          )}
        </Card>
      </Section>

      {isFd && d.stages.length > 0 && !['ACTIVE', 'MATURED', 'CLOSED'].includes(dep.status) ? (
        <Card>
          <StageTracker stages={d.stages.map((s, i) => ({ key: `${i}`, title: s.title, status: s.status === 'done' ? 'done' : s.status === 'current' ? 'current' : 'todo' }))} />
        </Card>
      ) : null}

      {isFd ? (
        <Expand title="Deposit (form F4)" initiallyOpen>
          <KeyValue label="5 · Amount" value={formatINR(dep.principal ?? 0)} />
          <KeyValue label="6 · Period" value={`${dep.tenureMonths} months`} />
          <KeyValue label="7 · Rate" value={`${dep.ratePercent}% a year`} />
          <KeyValue label="8 · Interest paid" value={PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY'] ?? ''} />
          <KeyValue label="Matures on" value={d.maturity ? formatDisplayDate(d.maturity.date) : '—'} />
          <KeyValue label="Maturity value" value={d.maturity ? formatINR(d.maturity.value) : '—'} />
          <KeyValue label="9 · Nominee" value={dep.nominee ? `${dep.nominee.name} (${dep.nominee.relation})` : '—'} />
          <KeyValue label="Holders" value={dep.operationMode === 'SINGLE' ? 'Single' : `${dep.operationMode === 'EITHER_OR_SURVIVOR' ? 'Either or survivor' : 'Any one or survivor'}: ${[d.member.name, ...dep.jointHolders].join(', ')}`} />
          <KeyValue label="Entered" value={dep.channel === 'APP' ? `In the app${dep.signature ? ` · signed with OTP ${formatDisplayDateTime(dep.signature.signedAt)}` : ''}` : dep.channel === 'COUNTER' ? 'At the counter (paper F4)' : '—'} />
          {dep.minor ? (
            <Text role="caption" tone="secondary">
              For a minor: {dep.minor.name}, born {formatDisplayDate(dep.minor.dob)}, comes of age {formatDisplayDate(minorMajorityDate(dep.minor.dob))}. Guardian {dep.minor.guardianName}
              {dep.minor.guardianRelation ? ` (${dep.minor.guardianRelation})` : ''}.
            </Text>
          ) : null}
          {dep.holders?.map((h) => (
            <Text key={h.name} role="caption" tone="secondary">
              {h.name} · s/o / w/o {h.fatherOrHusbandName} · {h.occupation} · {h.address} · {h.phone}
            </Text>
          ))}
        </Expand>
      ) : null}

      {d.payouts.length > 0 ? (
        <Expand title="Interest payouts">
          <Text role="caption" tone="tertiary">
            {PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY']}
            {d.maturity ? ` · ${formatINR(d.maturity.totalInterest)} over the term` : ''}
          </Text>
          {d.payouts.map((p) => (
            <View key={p.date} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Text role="body" style={{ flex: 1 }}>
                {formatDisplayDate(p.date)} · {formatINR(p.amount)}
                {p.voucherNo ? ` · ${p.voucherNo}` : ''}
              </Text>
              <Tag text={p.paid ? 'Paid' : 'Due'} color={p.paid ? 'success' : 'neutral'} size="xs" />
            </View>
          ))}
        </Expand>
      ) : null}

      <Expand title="Ledger" initiallyOpen={!isFd}>
        {d.ledger.length ? (
          d.ledger.map((r, i) => (
            <View key={i} style={{ gap: space[1], paddingVertical: space[2] }}>
              <Text role="label">
                {formatDisplayDate(r.date)} · {r.particulars}
              </Text>
              <Text role="caption" tone="secondary">
                {r.credit ? `Credit ${formatINR(r.credit)} · ` : ''}
                {r.debit ? `Debit ${formatINR(r.debit)} · ` : ''}balance {formatINR(r.balance)}
              </Text>
            </View>
          ))
        ) : (
          <Text role="caption" tone="tertiary">
            Nothing received yet.
          </Text>
        )}
      </Expand>

      {dep.payment ? (
        <Expand title={`Receipt ${dep.payment.receiptNo}`}>
          <KeyValue label="Mode" value={MODE[dep.payment.mode] ?? dep.payment.mode} />
          {dep.renewedFrom ? <KeyValue label="Renewal of" value={dep.renewedFrom.fdrNo} /> : null}
          {dep.renewedTo ? <KeyValue label="Renewed as" value={dep.renewedTo.accountNo} /> : null}
          <KeyValue label="Date" value={formatDisplayDate(dep.payment.date)} />
          <KeyValue label="Received by" value={dep.payment.byName} />
          <KeyValue label="Reference" value={dep.payment.reference ?? '—'} />
          {dep.payment.denominations ? (
            <Text role="caption" tone="secondary">
              Notes:{' '}
              {Object.entries(dep.payment.denominations)
                .filter(([, n]) => n)
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([v, n]) => `₹${v} × ${n}`)
                .join(' · ')}
            </Text>
          ) : null}
        </Expand>
      ) : null}

      {dep.signOffs?.secretary || dep.signOffs?.president ? (
        <Expand title="Accepted by">
          <KeyValue label="Secretary" value={dep.signOffs?.secretary ? `${dep.signOffs.secretary.byName} · ${formatDisplayDateTime(dep.signOffs.secretary.at)}` : 'Pending'} />
          <KeyValue label="President" value={dep.signOffs?.president ? `${dep.signOffs.president.byName} · ${formatDisplayDateTime(dep.signOffs.president.at)}` : 'Pending'} />
        </Expand>
      ) : null}

      {d.pledgedLoan ? (
        <Section title="Pledged">
          <Card onPress={() => router.push(`/staff/loan/${d.pledgedLoan!.id}`)}>
            <Text role="body" tone="secondary">
              Security for loan {d.pledgedLoan.loanNo} (outstanding {formatINR(d.pledgedLoan.outstanding)}). It cannot be closed early.
            </Text>
          </Card>
        </Section>
      ) : null}

      <View style={{ gap: space[3] }}>
        {dep.fdrNo ? <PrintButton text="FDR" path={`/deposits/${dep.id}/fdr`} /> : null}
        {dep.vouchers?.filter((v) => v.kind !== 'INTEREST').map((v) => <PrintButton key={v.no} text={`Voucher ${v.no}`} path={`/reports/print/fd-voucher?deposit=${dep.id}&vr=${v.no}`} />)}
      </View>
    </Screen>
  );
}
