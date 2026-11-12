// ST-23m Loan detail: stage tracker, next step, money, then the console's tabs as sections that open in place.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { amountInWords, daysBetweenDates, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ROLE_LABELS, type LoanDetail, type Role } from '@tgs/types';
import { ActionAlert, ask, Expand, Loaded, PrintButton, RuleChecks, useAction, useToday } from '@/components/staff';
import { StaffSanctionSheet } from '@/components/StaffSanctionSheet';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ACTION_LABEL, formFor, SECONDARY } from '@/lib/staffLoans';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, StageTracker, StatusTag, Tag, Text } from '@/ui';
import { space } from '@/theme';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['loan', id], queryFn: () => api.loans.get(id), refetchInterval: 20_000 });
  return (
    <Loaded page q={q} what="this loan">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function SuretyRecovery({ loanId }: { loanId: string }) {
  const q = useQuery({ queryKey: ['surety-recovery', loanId], queryFn: () => api.loans.suretyRecovery(loanId), retry: false });
  const a = useAction();
  const p = q.data;
  if (!p || (!p.shares.length && !p.recoveries.length)) return null;
  const raise = async () => {
    if (await ask('Recover from sureties', `Ask ${p.shares.length} suret${p.shares.length === 1 ? 'y' : 'ies'} to pay ${formatINR(p.overdue)} between them? They and the borrower are told on WhatsApp and in the app.`, 'Yes, ask the sureties')) await a.run(() => api.loans.raiseSuretyRecovery(loanId));
  };
  return (
    <Section title="Recover from sureties" description={`After ${p.threshold} unpaid month${p.threshold === 1 ? '' : 's'} in a row the sureties pay equal shares`}>
      <Card>
        {p.recoveries.length ? (
          <View style={{ gap: space[4] }}>
            {p.recoveries.map((r) => (
              <KeyValue key={r.id} label={`${r.suretyName} · share ${formatINR(r.share)} · paid ${formatINR(r.paid)}${r.demandedCycle ? ` · on the ${formatCycle(r.demandedCycle)} demand` : ''}`} value={r.status === 'OPEN' ? `${formatINR(r.due)} due` : r.closedReason === 'BORROWER_PAID' ? 'Closed: borrower paid' : 'Paid'} />
            ))}
            <Text role="caption" tone="tertiary">
              Raised by {p.recoveries[0]!.raisedByName} · {formatDisplayDateTime(p.recoveries[0]!.raisedOn)}
            </Text>
          </View>
        ) : (
          <View style={{ gap: space[3] }}>
            <Text role="body" tone="secondary">
              {formatINR(p.overdue)} overdue · unpaid {p.consecutiveCycles} month{p.consecutiveCycles === 1 ? '' : 's'} in a row.
            </Text>
            {p.eligible ? p.shares.map((s) => <KeyValue key={s.memberId} label={`${s.name} (${s.generalNo})`} value={formatINR(s.share)} />) : null}
            {p.reason ? (
              <Text role="caption" tone="tertiary">
                {p.reason}
              </Text>
            ) : null}
          </View>
        )}
      </Card>
      {!p.recoveries.length && p.eligible && p.canRaise ? <Button text="Recover from sureties" buttonType="secondary" fullWidth loading={a.busy} disabled={a.busy || a.unconfirmed} onPress={() => void raise()} /> : null}
      <ActionAlert action={a} heading="Not raised" />
    </Section>
  );
}

/** G1 (D-111, BR-040): what closing early costs today; the Cashier or Accountant takes the payment. */
function Closure({ loanId }: { loanId: string }) {
  const { session } = useAuth();
  const q = useQuery({ queryKey: ['loan-closure', loanId], queryFn: () => api.receipts.closureQuote(loanId), retry: false });
  const p = q.data;
  if (!p) return null;
  const canReceive = session?.user.role === 'CASHIER' || session?.user.role === 'ACCOUNTANT';
  return (
    <Section title="Close the loan early" description="Outstanding principal and interest up to today">
      <Card>
        <KeyValue label="Principal outstanding" value={formatINR(p.principal)} />
        <KeyValue label={`Interest from ${formatDisplayDate(p.interestFrom)}`} value={formatINR(p.interest)} />
        <KeyValue label="To close today" value={formatINR(p.total)} emphasis />
        {p.blockers.map((b) => (
          <Text key={b} role="caption" tone="warning">
            {b}
          </Text>
        ))}
      </Card>
      {canReceive && p.canClose ? <Button text="Take the closing payment" buttonType="secondary" fullWidth onPress={() => router.push(`/staff/loan/${loanId}/close`)} /> : null}
    </Section>
  );
}

function Body({ d, refetching, refetch }: { d: LoanDetail; refetching: boolean; refetch: () => void }) {
  const today = useToday();
  const l = d.loan;
  const f = l.form ?? {};
  const pay = f.pay;
  const blocking = d.checks.filter((c) => !c.pass && c.severity === 'block').length;
  const lastEvent = l.events.at(-1);
  const daysInStage = lastEvent ? daysBetweenDates(lastEvent.at, today) : 0;
  const primary = d.actions.filter((a) => !SECONDARY.has(a));
  const secondary = d.actions.filter((a) => SECONDARY.has(a));
  const open = (a: string) => router.push(`/staff/loan/${l.id}/action/${a}`);
  const signOffs: Array<[string, { byName: string; at: string } | undefined]> = [
    ['Review', l.signOffs?.review],
    [l.signOffs?.ddo?.manual ? `DDO (paper, ${l.signOffs.ddo.manual.reference})` : 'DDO certificate', l.signOffs?.ddo],
    ['Assessment', l.signOffs?.assessment],
    ['Secretary', l.signOffs?.secretary],
    ['President', l.signOffs?.president],
  ];

  return (
    <Screen
      header={<Header title="Loan" onBack={() => router.back()} />}
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
          {d.product.name} · {formatINR(l.sanctionedAmount ?? l.appliedAmount)}
        </Text>
        <Text role="caption" tone="secondary">
          {l.loanNo ?? l.applicationNo} · {d.member.departmentName} · applied {formatDisplayDate(l.appliedOn)}
        </Text>
        <Button text={`${d.member.name} (No. ${d.member.generalNo})`} subType="inline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push(`/staff/member/${d.member.id}`)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          <StatusTag entity="loan" status={l.status} audience="staff" />
          <Tag text={`Form ${formFor(l.product)}`} color="neutral" />
        </View>
      </View>

      {l.status === 'RETURNED' && l.returnInfo ? <Alert type="warning" heading={`Returned to the member by ${l.returnInfo.byName}`} description={l.returnInfo.reason} /> : null}
      {l.status === 'REJECTED' ? <Alert type="error" heading={`Rejected${l.rejection ? ` by ${l.rejection.byName}` : ''}`} description={l.rejection?.remarks ?? 'No reason recorded.'} /> : null}
      {l.status === 'ACTIVE' && l.disbursement ? <Alert type="success" heading={`Disbursed on ${formatDisplayDate(l.disbursement.date)}`} description={`${formatINR(l.disbursement.amount)} by ${l.disbursement.mode} · ref ${l.disbursement.reference} · ${l.disbursement.byName}`} /> : null}

      <Section title="Next step">
        <Card>
          {d.actions.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
              <Tag text="Your turn" color="primary" />
              <Text role="label">{primary.map((a) => ACTION_LABEL[a] ?? a).join(' or ')}</Text>
            </View>
          ) : d.waitingOn ? (
            <View style={{ gap: space[1] }}>
              <Text role="label">Waiting on {d.waitingOn}</Text>
              <Text role="caption" tone="tertiary">
                In this stage for {daysInStage === 0 ? 'less than a day' : `${daysInStage} day${daysInStage === 1 ? '' : 's'}`}
              </Text>
            </View>
          ) : (
            <Text role="body" tone="secondary">
              {l.status === 'ACTIVE' ? 'Disbursed and being recovered every month.' : 'No further steps.'}
            </Text>
          )}
        </Card>
      </Section>

      <Card>
        <StageTracker stages={d.stages.map((s, i) => ({ key: `${i}`, title: s.title, status: s.status === 'done' ? 'done' : s.status === 'current' ? 'current' : s.status === 'attention' ? 'attention' : 'todo' }))} />
      </Card>

      <Section title="Money" description="Live preview from the society's rules">
        <Card>
          <KeyValue label={l.emi ? 'EMI' : 'First instalment'} value={formatINR(l.emi ?? d.preview.emi)} />
          <KeyValue label="Total interest" value={formatINR(d.preview.totalInterest)} />
          <KeyValue label="Share deposit deduction" value={formatINR(l.shareDepositDeduction ?? d.preview.shareDeduction)} />
          <KeyValue label="Net disbursable" value={formatINR(l.netDisbursable ?? d.preview.netDisbursable)} />
          {l.status === 'ACTIVE' ? <KeyValue label="Outstanding" value={formatINR(l.outstandingPrincipal)} emphasis /> : null}
        </Card>
      </Section>

      <Expand title="Application" initiallyOpen>
        <KeyValue label="7a · Amount required" value={formatINR(l.appliedAmount)} />
        <Text role="caption" tone="tertiary">
          {amountInWords(l.appliedAmount)}
        </Text>
        <KeyValue label="7b · Purpose" value={l.purpose || '—'} />
        <KeyValue label="11 · Monthly instalments" value={`${l.appliedInstalments} months at ${l.ratePercent}% a year`} />
        {f.education ? <KeyValue label="Education" value={`${f.education.studentName} (${f.education.relation}) · ${f.education.course}, ${f.education.institution}`} /> : null}
        {d.product.code !== 'SALARY' ? <KeyValue label="8 · Security" value={d.pledgedDeposit ? `Pledge of FD ${d.pledgedDeposit.accountNo} (${formatINR(d.pledgedDeposit.principal)})` : f.security?.type === 'OTHER' ? (f.security.description ?? 'Other') : d.sureties.length ? `${d.sureties.length} sureties` : '—'} /> : null}
        {f.additionalShares ? <KeyValue label="6c · Additional shares proposed" value={String(f.additionalShares)} /> : null}
        <KeyValue label="Entered" value={l.channel === 'COUNTER' ? `By ${l.createdByName ?? 'the office'} from the paper form` : 'By the member in the app'} />
        <KeyValue label="Signed" value={l.signature ? `With OTP · ${formatDisplayDateTime(l.signature.signedAt)} · text ${l.signature.textVersion}` : l.channel === 'COUNTER' ? 'On paper' : 'Not yet'} />
        {pay ? (
          <>
            <Text role="overline" tone="tertiary">
              Items 4–5 · Pay details (DDO certifies)
            </Text>
            <KeyValue label="Scale of pay" value={pay.scaleOfPay || '—'} />
            <KeyValue label="5a · Gross salary" value={formatINR(pay.grossSalary)} />
            <KeyValue label="5b · Govt loan deductions" value={formatINR(pay.govtLoanDeductions)} />
            <KeyValue label="5c · Other loan deductions" value={formatINR(pay.otherLoanDeductions)} />
            <KeyValue label="5d · Total deductions" value={formatINR(pay.govtLoanDeductions + pay.otherLoanDeductions)} />
            <KeyValue label="5e · Net salary" value={formatINR(d.preview.netSalary)} />
          </>
        ) : null}
        {f.salary ? (
          <>
            <Text role="overline" tone="tertiary">
              Form F3 · Pay this month
            </Text>
            <KeyValue label="5 · Substantive pay" value={formatINR(f.salary.substantivePay)} />
            <KeyValue label="6 · Compulsory deductions" value={f.salary.compulsoryDeductions.length ? f.salary.compulsoryDeductions.map((x) => `${x.label} ${formatINR(x.amount)}`).join(' · ') : 'None'} />
            <KeyValue label="9 · Net pay earned to date" value={formatINR(f.salary.netPayEarnedToDate)} />
          </>
        ) : null}
      </Expand>

      {l.sanctionSheet ? (
        <Expand title="For office use · sanction sheet">
          <StaffSanctionSheet sheet={l.sanctionSheet} />
        </Expand>
      ) : null}

      <Expand title="Eligibility" badge={blocking ? <Tag text={String(blocking)} color="error" size="xs" /> : undefined}>
        {d.checks.length ? (
          <RuleChecks checks={d.checks} />
        ) : (
          <Text role="body" tone="secondary">
            This loan is past sanction, so eligibility is not re-run.
          </Text>
        )}
      </Expand>

      <Expand title={`Sureties (${d.sureties.length})`}>
        {!d.product.suretiesRequired ? (
          <Text role="body" tone="secondary">
            {d.product.name} does not need sureties.
          </Text>
        ) : !d.sureties.length ? (
          <Text role="caption" tone="tertiary">
            No sureties chosen yet.
          </Text>
        ) : (
          d.sureties.map((s) => {
            const issue = s.checks.find((c) => !c.pass && c.severity === 'block') ?? s.checks.find((c) => !c.pass && c.severity === 'warn');
            return (
              <Card key={s.memberId} onPress={() => router.push(`/staff/member/${s.memberId}`)}>
                <View style={{ gap: space[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <Text role="label" style={{ flex: 1 }}>
                      {s.name}
                    </Text>
                    {s.status ? <StatusTag entity="surety" status={s.status} audience="staff" size="xs" /> : null}
                  </View>
                  <Text role="caption" tone="tertiary">
                    No. {s.generalNo} · {s.designation} · {s.departmentName}
                  </Text>
                  <KeyValue label="(d) Date of birth" value={formatDisplayDate(s.dob)} />
                  <KeyValue label="(e) Substantive pay" value={formatINR(s.substantivePay)} />
                  <KeyValue label="(j) Shares held" value={String(s.numberOfShares)} />
                  <KeyValue label="(l) Retires" value={`${formatDisplayDate(s.dor)} · ${s.leftoverLabel} left`} />
                  {issue ? (
                    <Text role="caption" tone={issue.severity === 'block' ? 'danger' : 'warning'}>
                      {issue.message}
                    </Text>
                  ) : null}
                  <Text role="caption" tone="tertiary">
                    Item 10 · Already a surety for
                  </Text>
                  {s.guarantees.length ? (
                    s.guarantees.map((g) => (
                      <Text key={g.applicationNo} role="caption" tone="secondary">
                        {g.borrower} (No. {g.generalNo}) · {g.product} · {g.applicationNo} · outstanding {formatINR(g.outstanding)}
                      </Text>
                    ))
                  ) : (
                    <Text role="caption" tone="secondary">
                      No other loans.
                    </Text>
                  )}
                  {s.declineReason ? (
                    <Text role="caption" tone="danger">
                      Declined: {s.declineReason}
                    </Text>
                  ) : null}
                </View>
              </Card>
            );
          })
        )}
      </Expand>

      <Expand title="Schedule">
        {l.schedule.length ? (
          l.schedule.map((r) => (
            <View key={r.installmentNo} style={{ gap: space[1], paddingVertical: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Text role="label" style={{ flex: 1 }}>
                  {r.installmentNo} · {formatCycle(r.dueCycle)} · {formatINR(r.emi)}
                </Text>
                {r.paidStatus ? <StatusTag entity="schedule" status={r.paidStatus} audience="staff" size="xs" /> : null}
              </View>
              <Text role="caption" tone="secondary">
                Opening {formatINR(r.opening)} · interest {formatINR(r.interest)} · principal {formatINR(r.principal)} · closing {formatINR(r.closing)}
              </Text>
            </View>
          ))
        ) : (
          <Text role="body" tone="secondary">
            The schedule is fixed at sanction. Expected now: first instalment {formatINR(d.preview.emi)}
            {d.preview.lastInstalment !== d.preview.emi ? `, last ${formatINR(d.preview.lastInstalment)}` : ''}, total interest {formatINR(d.preview.totalInterest)}.
          </Text>
        )}
      </Expand>

      <Expand title="Activity">
        {l.events.length ? (
          <StageTracker stages={[...l.events].reverse().map((e, i) => ({ key: `${e.at}-${i}`, title: e.action === 'submit' ? 'Application submitted' : (ACTION_LABEL[e.action] ?? e.action), description: `${e.actorName} · ${ROLE_LABELS[e.actorRole as Role] ?? e.actorRole}${e.remarks ? `\n“${e.remarks}”` : ''}`, date: formatDisplayDateTime(e.at), status: e.toStatus === 'REJECTED' ? 'failed' : e.toStatus === 'RETURNED' ? 'attention' : 'done' }))} />
        ) : (
          <Text role="caption" tone="tertiary">
            No activity yet.
          </Text>
        )}
      </Expand>

      {l.signOffs?.review || l.signOffs?.ddo || l.signOffs?.assessment ? (
        <Expand title="Sign-offs">
          {signOffs.map(([label, so]) => (
            <KeyValue key={label} label={label} value={so ? `${so.byName} · ${formatDisplayDateTime(so.at)}` : '—'} />
          ))}
        </Expand>
      ) : null}

      {l.status === 'ACTIVE' && l.sureties.length > 0 ? <SuretyRecovery loanId={l.id} /> : null}
      {l.status === 'ACTIVE' ? <Closure loanId={l.id} /> : null}

      <Expand title="Borrower">
        <KeyValue label="Designation" value={d.member.designation} />
        <KeyValue label="Mobile" value={d.member.mobileMasked} />
        <KeyValue label="Retires on" value={formatDisplayDate(d.member.dor)} />
        <KeyValue label="Left-over service" value={d.member.leftover.label} />
        {d.parentLoan ? <KeyValue label="Top-up of" value={d.parentLoan.loanNo ?? d.parentLoan.applicationNo} /> : null}
      </Expand>

      <View style={{ gap: space[3] }}>
        {l.status !== 'DRAFT' && l.product !== 'DEPOSIT' ? <PrintButton text="Print form" path={`/reports/print/loan-form?loan=${l.id}`} /> : null}
        {l.sanctionLetterNo ? <PrintButton text="Bond & receipt" path={`/reports/print/loan-bond?loan=${l.id}`} /> : null}
        {l.sanctionLetterNo ? <PrintButton text="Sanction letter" path={`/loans/${l.id}/letter`} /> : null}
      </View>
    </Screen>
  );
}
