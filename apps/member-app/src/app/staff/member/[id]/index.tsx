// ST-12m Member profile: quick actions, then the console's tabs as sections that open in place.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { MemberDetail, MemberLoanRow } from '@tgs/types';
import { ActionAlert, ask, Expand, Loaded, PrintButton, StatTile, TileGrid, useAction, useCan } from '@/components/staff';
import { api } from '@/lib/api';
import { changeValue, EVENT_LABEL, fieldLabel, MANDATE_LABEL, retiringLabel, SCHEME_LABEL } from '@/lib/staffMembers';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, StageTracker, StatusTag, Tag, Text } from '@/ui';
import { space } from '@/theme';

const address = (a: { line1: string; line2?: string; city: string; district: string; pincode: string }) => [a.line1, a.line2, a.city, a.district, a.pincode].filter(Boolean).join(', ');

export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id) });
  return (
    <Loaded q={q} what="this member">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function LoanRows({ rows, empty, guarantee }: { rows: MemberLoanRow[]; empty: string; guarantee?: boolean }) {
  if (!rows.length)
    return (
      <Text role="caption" tone="tertiary">
        {empty}
      </Text>
    );
  return (
    <View style={{ gap: space[4] }}>
      {rows.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/staff/loan/${l.id}`)}>
          <View style={{ gap: space[2] }}>
            <Text role="label">{guarantee && l.borrower ? `${l.borrower.name} (No. ${l.borrower.generalNo})` : l.productName}</Text>
            <Text role="caption" tone="tertiary">
              {guarantee ? `${l.productName} · ` : ''}
              {l.loanNo ?? l.applicationNo} · applied {formatDisplayDate(l.appliedOn)}
            </Text>
            <Text role="caption" tone="secondary">
              {formatINR(l.amount)} · outstanding {formatINR(l.outstanding)}
              {l.emi ? ` · EMI ${formatINR(l.emi)}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
              <StatusTag entity="loan" status={l.status} audience="staff" size="xs" />
              {guarantee && l.suretyStatus ? <StatusTag entity="surety" status={l.suretyStatus} audience="staff" size="xs" /> : null}
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

function Body({ d, refetching, refetch }: { d: MemberDetail; refetching: boolean; refetch: () => void }) {
  const m = d.member;
  const a = useAction();
  const can = useCan();
  const dues = useQuery({ queryKey: ['dues', m.id], queryFn: () => api.receipts.dues(m.id), retry: false });
  const notices = useQuery({ queryKey: ['notices', m.id], queryFn: () => api.receipts.notices(m.id), retry: false });
  const soon = retiringLabel(d.leftover.months, m.status);
  const activeLoans = d.loans.filter((l) => l.status === 'ACTIVE').length;
  const outstanding = d.loans.filter((l) => l.status === 'ACTIVE' || l.status === 'SANCTIONED').reduce((s, l) => s + l.outstanding, 0);
  const deposits = d.deposits.filter((x) => x.status === 'ACTIVE').reduce((s, x) => s + (x.scheme === 'FD' ? (x.principal ?? 0) : x.balance), 0);
  const pending = d.changeRequests.filter((r) => r.status === 'PENDING').length;
  const agree = async () => {
    if (await ask('Agree the mandate', `Salary recovery for ${m.name} continues from ${d.department?.name ?? 'this department'}.`, 'Agree')) await a.run(() => api.members.agreeMandate(m.id));
  };
  const penal = dues.data?.arrears.reduce((s, x) => s + x.penal, 0) ?? 0;

  return (
    <Screen header={<Header title="Member" onBack={() => router.back()} />} refreshing={refetching} onRefresh={refetch}>
      <View style={{ gap: space[3] }}>
        <Text role="pageTitle">{m.name}</Text>
        <Text role="caption" tone="secondary">
          General No. {m.generalNo} · {m.designation} · {d.department?.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          <StatusTag entity="member" status={m.status} audience="staff" />
          <Tag text={activeLoans ? 'Loanee' : 'Non-loanee'} color={activeLoans ? 'primary' : 'neutral'} />
          {soon ? <Tag text={soon} color="warning" /> : null}
          {notices.data?.defaulter.isDefaulter ? <Tag text={`Defaulter · ${notices.data.defaulter.consecutiveCycles} month${notices.data.defaulter.consecutiveCycles === 1 ? '' : 's'} unpaid`} color="error" /> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {d.can.edit ? <Button text="Edit" buttonType="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/edit`)} /> : null}
        {d.can.transfer ? <Button text="Transfer" buttonType="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/transfer`)} /> : null}
        {d.can.edit || m.status !== 'ACTIVE' ? <Button text={m.status === 'ACTIVE' ? 'Member leaves' : 'Final settlement'} buttonType="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/settlement`)} /> : null}
      </View>

      {d.upcomingTransfer ? <Alert type="primary" heading={`Moves to the ${d.upcomingTransfer.toDepartmentName} demand sheet from ${formatCycle(d.upcomingTransfer.effectiveCycle)}`} description={`Transferred from ${d.upcomingTransfer.fromDepartmentName}. Sheets already generated stay with the old department.`} /> : null}
      {d.dorWarning ? <Alert type="warning" heading="Check the date of retirement" description={d.dorWarning} /> : null}

      <TileGrid>
        <StatTile label="Share capital" value={formatINR(d.shares?.shareCapital ?? 0)} sub={`${d.shares?.numberOfShares ?? m.numberOfShares} shares`} />
        <StatTile label="Share deposit" value={formatINR(d.shares?.shareDepositBalance ?? 0)} sub="From loan deductions" />
        <StatTile label="Deposits held" value={formatINR(deposits)} sub={`${d.deposits.filter((x) => x.status === 'ACTIVE').length} accounts`} />
        <StatTile label="Loans outstanding" value={formatINR(outstanding)} sub={`${activeLoans} active`} />
      </TileGrid>

      <Section title="Salary recovery mandate" description="Paper forms F5 / F6">
        <Card>
          {d.mandate ? (
            <View style={{ gap: space[2] }}>
              <Text role="label">{MANDATE_LABEL[d.mandate.status]}</Text>
              <Text role="caption" tone="secondary">
                {d.mandate.status === 'AGREED' ? `${d.mandate.agreedByName ?? 'DDO'} · ${formatDisplayDate(d.mandate.agreedOn ?? d.mandate.signedOn)}` : `${d.department?.ddoName ?? 'The DDO'} (${d.department?.name ?? ''}) has not agreed yet. New loans show a warning.`}
              </Text>
            </View>
          ) : (
            <Text role="body" tone="secondary">
              No mandate on record.
            </Text>
          )}
        </Card>
        {d.can.agreeMandate ? <Button text="Agree mandate" fullWidth loading={a.busy} disabled={a.busy} onPress={() => void agree()} /> : null}
        <ActionAlert action={a} heading="Couldn't agree" />
      </Section>

      {dues.data || notices.data ? (
        <Section title="Outstanding & notices" description="Unpaid from posted months; penal grows daily until paid">
          <Card>
            {dues.data ? (
              <>
                <KeyValue label="Unpaid instalments" value={formatINR(dues.data.totalArrears - penal)} />
                <KeyValue label="Penal interest" value={formatINR(penal)} />
                <KeyValue label="Total outstanding" value={formatINR(dues.data.totalArrears)} emphasis />
                <KeyValue label="Months unpaid" value={String(dues.data.arrears.length)} />
              </>
            ) : null}
            {dues.data?.suretyRecoveries?.length ? (
              <>
                <Divider />
                {dues.data.suretyRecoveries.map((r) => (
                  <Text key={r.id} role="caption" tone="secondary">
                    As surety: {r.borrowerName} · {r.loanNo} · share {formatINR(r.share)} · paid {formatINR(r.paid)} · {formatINR(r.due)} due
                  </Text>
                ))}
              </>
            ) : null}
            {notices.data ? (
              <>
                <Divider />
                {notices.data.notices.length ? (
                  notices.data.notices.map((n) => (
                    <View key={n.id} style={{ paddingVertical: space[2] }}>
                      <Text role="label">
                        {n.kind === 'DEFAULTER' ? 'Defaulter notice' : `Surety notice · ${n.borrowerName}`} · {formatCycle(n.cycle)}
                      </Text>
                      <Text role="caption" tone="secondary">
                        {n.loanNo} · {formatINR(n.overdue)} overdue · {n.delivery.inApp === 'SENT' ? 'sent in the app' : n.delivery.inApp === 'FAILED' ? 'app delivery failed' : 'app delivery pending'}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text role="caption" tone="tertiary">
                    No notices. Defaulter after {notices.data.defaulter.threshold} unpaid month{notices.data.defaulter.threshold === 1 ? '' : 's'}.
                  </Text>
                )}
              </>
            ) : null}
          </Card>
          {penal > 0 && can('collections.waivePenal') ? <Button text="Waive penal interest" buttonType="secondary" fullWidth onPress={() => router.push(`/staff/member/${m.id}/waive`)} /> : null}
          {notices.data?.defaulter.isDefaulter ? <PrintButton text="Print defaulter notice" path={`/reports/print/defaulter-notice?member=${m.id}`} /> : null}
        </Section>
      ) : null}

      <Expand title="Overview" initiallyOpen>
        <KeyValue label="Father's name" value={m.fatherName} />
        <KeyValue label="Date of birth" value={`${formatDisplayDate(m.dob)} · ${d.ageYears} yrs`} />
        <KeyValue label="Gender" value={m.gender === 'F' ? 'Female' : 'Male'} />
        <KeyValue label="Caste" value={m.caste ?? 'Not recorded'} />
        <KeyValue label="Mobile" value={`${m.mobile}${d.can.seeFullMobile ? '' : ' (masked for your role)'}`} />
        <KeyValue label="Email" value={m.email || '—'} />
        <KeyValue label="Employee ID" value={m.employeeId} />
        <KeyValue label="Present address" value={address(m.presentAddress)} />
        <KeyValue label="Permanent address" value={JSON.stringify(m.permanentAddress) === JSON.stringify(m.presentAddress) ? 'Same as present address' : address(m.permanentAddress)} />
        <KeyValue label="Date of joining service" value={formatDisplayDate(m.doj)} />
        <KeyValue label="Employment type" value={m.employmentType === 'REGULAR' ? 'Regular' : 'Approved probationer'} />
        <KeyValue label="Date of retirement" value={formatDisplayDate(m.dor)} />
        <KeyValue label="Left-over service" value={d.leftover.label} />
        <KeyValue label="Joined the society" value={formatDisplayDate(m.joinedSocietyOn)} />
        <KeyValue label="Department DDO" value={d.department?.ddoName ?? '—'} />
        <KeyValue label="Member app" value={m.portalActivated ? 'Activated' : 'Not activated yet'} />
        <KeyValue label="Nominee" value={`${m.nominee.name} (${m.nominee.relation})`} />
        <KeyValue label="Anniversary" value={m.anniversaryDate ? formatDisplayDate(m.anniversaryDate) : '—'} />
      </Expand>

      <Expand title="Pay profile">
        <Text role="caption" tone="tertiary">
          {m.payProfile.certifiedAt ? `Certified ${formatDisplayDate(m.payProfile.certifiedAt)}` : 'Not certified'}
        </Text>
        <KeyValue label="Scale of pay" value={m.payProfile.scaleOfPay || '—'} />
        <KeyValue label="Gross salary" value={formatINR(m.payProfile.grossSalary)} />
        <KeyValue label="Substantive pay" value={formatINR(m.payProfile.substantivePay)} />
        <KeyValue label="Government loan deductions" value={formatINR(m.payProfile.govtLoanDeductions)} />
        <KeyValue label="Other loan deductions" value={formatINR(m.payProfile.otherLoanDeductions)} />
      </Expand>

      <Expand title="Service history">
        {d.serviceEvents.length ? (
          <StageTracker stages={d.serviceEvents.map((e) => ({ key: e.id, title: EVENT_LABEL[e.type], description: `${e.summary}${e.effectiveCycle ? ` · demand sheet from ${formatCycle(e.effectiveCycle)}` : ''}${e.byName ? ` · ${e.byName}` : ''}`, date: formatDisplayDate(e.date), status: 'done' as const }))} />
        ) : (
          <Text role="caption" tone="tertiary">
            No service events yet.
          </Text>
        )}
      </Expand>

      <Expand title="Loans & sureties">
        <Text role="label">Own loans</Text>
        <LoanRows rows={d.loans} empty="No loans yet." />
        <Text role="label">Surety for</Text>
        <LoanRows rows={d.guarantees} empty="Not a surety on any loan." guarantee />
      </Expand>

      <Expand title="Deposits">
        {d.deposits.length ? (
          d.deposits.map((x) => (
            <Card key={x.id} onPress={x.scheme === 'FD' ? () => router.push(`/staff/deposit/${x.id}`) : undefined}>
              <View style={{ gap: space[2] }}>
                <Text role="label">{SCHEME_LABEL[x.scheme] ?? x.scheme}</Text>
                <Text role="caption" tone="tertiary">
                  {x.accountNo} · opened {formatDisplayDate(x.openedOn)}
                </Text>
                <Text role="caption" tone="secondary">
                  {x.scheme === 'FD' ? `Principal ${formatINR(x.principal ?? 0)}` : x.monthlyAmount ? `Monthly ${formatINR(x.monthlyAmount)}` : `${x.ratePercent}%`} · {x.maturityDate ? `matures ${formatDisplayDate(x.maturityDate)}` : `balance ${formatINR(x.balance)}`}
                </Text>
                <StatusTag entity="deposit" status={x.status} audience="staff" size="xs" />
              </View>
            </Card>
          ))
        ) : (
          <Text role="caption" tone="tertiary">
            No deposit accounts.
          </Text>
        )}
      </Expand>

      <Expand title="Ledger">
        {d.ledger.length ? (
          d.ledger.map((r) => (
            <View key={`${r.cycle}-${r.departmentName}`} style={{ gap: space[1], paddingVertical: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <Text role="label" style={{ flex: 1 }}>
                  {formatCycle(r.cycle)}
                </Text>
                <StatusTag entity="demandSheet" status={r.sheetStatus} audience="staff" size="xs" />
              </View>
              <Text role="caption" tone="secondary">
                {r.departmentName} · demand {formatINR(r.demand)} · recovered {r.recovered === undefined ? '—' : formatINR(r.recovered)}
              </Text>
            </View>
          ))
        ) : (
          <Text role="caption" tone="tertiary">
            No demand sheets include this member yet.
          </Text>
        )}
      </Expand>

      <Expand title="Documents">
        {d.documents.map((doc) => (
          <KeyValue key={doc.type} label={doc.label} value={`${doc.fileName} · ${formatDisplayDate(doc.uploadedOn)}`} />
        ))}
      </Expand>

      <Expand title="Change requests" badge={pending ? <Tag text={String(pending)} color="warning" size="xs" /> : undefined}>
        {d.changeRequests.length ? (
          d.changeRequests.map((r) => (
            <View key={r.id} style={{ gap: space[2], paddingVertical: space[2] }}>
              <StatusTag entity="changeRequest" status={r.status} audience="staff" size="xs" />
              {r.fields.map((f) => (
                <Text key={f.field} role="body" tone="secondary">
                  {fieldLabel(f)}: {changeValue(f, f.oldValue)} → {changeValue(f, f.newValue)}
                </Text>
              ))}
              <Text role="caption" tone="tertiary">
                “{r.reason}” · {formatDisplayDateTime(r.createdAt)}
                {r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text role="caption" tone="tertiary">
            No profile change requests from this member.
          </Text>
        )}
        <Button text="Open change requests" subType="inline" onPress={() => router.push('/staff/change-requests')} />
      </Expand>

      <View style={{ gap: space[3] }}>
        <PrintButton text="Print F5 agreement" path={`/reports/print/agreement?member=${m.id}&version=A`} />
        <PrintButton text="Print F6 agreement" path={`/reports/print/agreement?member=${m.id}&version=B`} />
        <PrintButton text="Print F1 membership form" path={`/reports/print/membership?member=${m.id}`} />
      </View>
    </Screen>
  );
}
