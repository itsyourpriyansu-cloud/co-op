// ST-12m Member profile: quick actions, then the console's tabs as sections that open in place.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileUp } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR, REQUIRED_DOCUMENTS, RETIREMENT_CHANGE_APPROVERS } from '@tgs/domain';
import type { MemberDetail, MemberLoanRow } from '@tgs/types';
import { FileButton } from '@/components/FileButton';
import { ActionAlert, ask, Expand, Loaded, StatTile, TileGrid, useAction, useCan, StaffDocument } from '@/components/staff';
import { pickDocumentImage } from '@/lib/files';
import { api } from '@/lib/api';
import { agreementHtml, defaulterNoticeHtml, membershipFormHtml, membershipFromMember } from '@/lib/staffDocuments';
import { documentFileName } from '@/lib/documents';
import { changeValue, EVENT_LABEL, fieldLabel, MANDATE_LABEL, retiringLabel, SCHEME_LABEL } from '@/lib/staffMembers';
import { Banner, Button, Card, Divider, Header, MetadataListItem, Screen, Section, SelectField, StageTracker, StatusToken, Token, Text, TextField, Link } from '@/ui';
import { spacing } from '@/theme';

const address = (a: { line1: string; line2?: string; city: string; district: string; pincode: string }) => [a.line1, a.line2, a.city, a.district, a.pincode].filter(Boolean).join(', ');

export default function MemberProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id) });
  return (
    <Loaded page q={q} what="this member">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function LoanRows({ rows, empty, guarantee }: { rows: MemberLoanRow[]; empty: string; guarantee?: boolean }) {
  if (!rows.length)
    return (
      <Text type="supporting" tone="secondary">
        {empty}
      </Text>
    );
  return (
    <View style={{ gap: spacing[2] }}>
      {rows.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/staff/loan/${l.id}`)}>
          <View style={{ gap: spacing[1] }}>
            <Text type="label">{guarantee && l.borrower ? `${l.borrower.name} (No. ${l.borrower.generalNo})` : l.productName}</Text>
            <Text type="supporting" tone="secondary">
              {guarantee ? `${l.productName} · ` : ''}
              {l.loanNo ?? l.applicationNo} · applied {formatDisplayDate(l.appliedOn)}
            </Text>
            <Text type="supporting" tone="secondary">
              {formatINR(l.amount)} · outstanding {formatINR(l.outstanding)}
              {l.emi ? ` · EMI ${formatINR(l.emi)}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] }}>
              <StatusToken entity="loan" status={l.status} audience="staff" size="xs" />
              {guarantee && l.suretyStatus ? <StatusToken entity="surety" status={l.suretyStatus} audience="staff" size="xs" /> : null}
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const APPROVER_NAME: Record<string, string> = { ACCOUNTANT: 'Accountant', SECRETARY: 'Secretary', PRESIDENT: 'President' };

/** D-131: the Super Admin proposes a new date of retirement; the Accountant, Secretary and President approve in turn. */
function RetirementSection({ d }: { d: MemberDetail }) {
  const a = useAction();
  const [remarks, setRemarks] = useState('');
  const c = d.retirementChange;
  if (!c && !d.can.proposeRetirementChange) return null;
  const decide = async (decision: 'approve' | 'reject') => {
    const verb = decision === 'approve' ? 'Approve' : 'Reject';
    if (await ask(`${verb} the new date`, c ? `${formatDisplayDate(c.currentDor)} → ${formatDisplayDate(c.newDor)} for ${d.member.name}.` : '', verb)) await a.run(() => api.members.decideRetirementChange(d.member.id, decision, remarks.trim() || undefined), () => setRemarks(''));
  };
  return (
    <Section title="Date of retirement" description="Super Admin proposes; Accountant, Secretary and President approve">
      {c ? (
        <Card>
          <View style={{ gap: spacing[1] }}>
            <Text type="label">
              {formatDisplayDate(c.currentDor)} → {formatDisplayDate(c.newDor)}
            </Text>
            <Text type="supporting" tone="secondary">
              {c.status === 'PENDING' ? `Waiting for the ${APPROVER_NAME[c.nextApprover ?? ''] ?? ''}` : c.status === 'APPROVED' ? 'Approved' : 'Rejected'} · Reason: {c.reason}
            </Text>
            <Text type="supporting" tone="secondary">
              Proposed by {c.proposed.byName} · {formatDisplayDateTime(c.proposed.at)}
            </Text>
            {RETIREMENT_CHANGE_APPROVERS.map((role, i) => {
              const ok = c.approvals[i];
              const no = !ok && c.rejection?.role === role ? c.rejection : undefined;
              return (
                <Text key={role} type="supporting" tone={ok ? 'secondary' : 'secondary'}>
                  {APPROVER_NAME[role]}: {ok ? `approved · ${ok.byName}` : no ? `rejected · ${no.byName}: ${no.remarks ?? ''}` : c.status === 'PENDING' && c.nextApprover === role ? 'waiting' : '—'}
                </Text>
              );
            })}
          </View>
        </Card>
      ) : null}
      {d.can.decideRetirementChange ? (
        <>
          <TextField label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Needed to reject" multiline numberOfLines={2} error={a.fields.remarks} />
          <View style={{ flexDirection: 'row', gap: spacing[1.5] }}>
            <Button label="Approve" loading={a.busy} disabled={a.busy} onPress={() => void decide('approve')} />
            <Button label="Reject" variant="destructive" disabled={a.busy} onPress={() => void decide('reject')} />
          </View>
        </>
      ) : null}
      {d.can.proposeRetirementChange ? <Button label="Change date of retirement" variant="secondary" fullWidth onPress={() => router.push(`/staff/member/${d.member.id}/retirement`)} /> : null}
      <ActionAlert action={a} heading="Not saved" />
    </Section>
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
      <View style={{ gap: spacing[1.5] }}>
        <Text type="h1">{m.name}</Text>
        <Text type="supporting" tone="secondary">
          General No. {m.generalNo} · {m.designation} · {d.department?.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] }}>
          <StatusToken entity="member" status={m.status} audience="staff" />
          <Token text={activeLoans ? 'Loanee' : 'Non-loanee'} status={activeLoans ? 'info' : 'neutral'} />
          {soon ? <Token text={soon} status="warning" /> : null}
          {notices.data?.defaulter.isDefaulter ? <Token text={`Defaulter · ${notices.data.defaulter.consecutiveCycles} month${notices.data.defaulter.consecutiveCycles === 1 ? '' : 's'} unpaid`} status="error" /> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] }}>
        {d.can.edit ? <Button label="Edit" variant="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/edit`)} /> : null}
        {d.can.transfer ? <Button label="Transfer" variant="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/transfer`)} /> : null}
        {d.can.edit || m.status !== 'ACTIVE' ? <Button label={m.status === 'ACTIVE' ? 'Member leaves' : 'Final settlement'} variant="secondary" size="sm" onPress={() => router.push(`/staff/member/${m.id}/settlement`)} /> : null}
      </View>

      {d.upcomingTransfer ? <Banner status="info" heading={`Moves to the ${d.upcomingTransfer.toDepartmentName} demand sheet from ${formatCycle(d.upcomingTransfer.effectiveCycle)}`} description={`Transferred from ${d.upcomingTransfer.fromDepartmentName}. Sheets already generated stay with the old department.`} /> : null}
      {d.dorWarning ? <Banner status="warning" heading="Check the date of retirement" description={d.dorWarning} /> : null}

      <TileGrid>
        <StatTile label="Share capital" value={formatINR(d.shares?.shareCapital ?? 0)} sub={`${d.shares?.numberOfShares ?? m.numberOfShares} shares`} />
        <StatTile label="Share deposit" value={formatINR(d.shares?.shareDepositBalance ?? 0)} sub="From loan deductions" />
        <StatTile label="Deposits held" value={formatINR(deposits)} sub={`${d.deposits.filter((x) => x.status === 'ACTIVE').length} accounts`} />
        <StatTile label="Loans outstanding" value={formatINR(outstanding)} sub={`${activeLoans} active`} />
      </TileGrid>

      <Section title="Salary recovery mandate" description="Paper forms F5 / F6">
        <Card>
          {d.mandate ? (
            <View style={{ gap: spacing[1] }}>
              <Text type="label">{MANDATE_LABEL[d.mandate.status]}</Text>
              <Text type="supporting" tone="secondary">
                {d.mandate.status === 'AGREED' ? `${d.mandate.agreedByName ?? 'DDO'} · ${formatDisplayDate(d.mandate.agreedOn ?? d.mandate.signedOn)}` : `${d.department?.ddoName ?? 'The DDO'} (${d.department?.name ?? ''}) has not agreed yet. New loans show a warning.`}
              </Text>
            </View>
          ) : (
            <Text type="body" tone="secondary">
              No mandate on record.
            </Text>
          )}
        </Card>
        {d.can.agreeMandate ? <Button label="Agree mandate" fullWidth loading={a.busy} disabled={a.busy} onPress={() => void agree()} /> : null}
        <ActionAlert action={a} heading="Couldn't agree" />
      </Section>

      <RetirementSection d={d} />

      {dues.data || notices.data ? (
        <Section title="Outstanding & notices" description="Unpaid from posted months; penal grows daily until paid">
          <Card>
            {dues.data ? (
              <>
                <MetadataListItem label="Unpaid instalments" value={formatINR(dues.data.totalArrears - penal)} />
                <MetadataListItem label="Penal interest" value={formatINR(penal)} />
                <MetadataListItem label="Total outstanding" value={formatINR(dues.data.totalArrears)} emphasis />
                <MetadataListItem label="Months unpaid" value={String(dues.data.arrears.length)} />
              </>
            ) : null}
            {dues.data?.suretyRecoveries?.length ? (
              <>
                <Divider />
                {dues.data.suretyRecoveries.map((r) => (
                  <Text key={r.id} type="supporting" tone="secondary">
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
                    <View key={n.id} style={{ paddingVertical: spacing[1] }}>
                      <Text type="label">
                        {n.kind === 'DEFAULTER' ? 'Defaulter notice' : `Surety notice · ${n.borrowerName}`} · {formatCycle(n.cycle)}
                      </Text>
                      <Text type="supporting" tone="secondary">
                        {n.loanNo} · {formatINR(n.overdue)} overdue · {n.delivery.inApp === 'SENT' ? 'sent in the app' : n.delivery.inApp === 'FAILED' ? 'app delivery failed' : 'app delivery pending'}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text type="supporting" tone="secondary">
                    No notices. Defaulter after {notices.data.defaulter.threshold} unpaid month{notices.data.defaulter.threshold === 1 ? '' : 's'}.
                  </Text>
                )}
              </>
            ) : null}
          </Card>
          {penal > 0 && can('collections.waivePenal') ? <Button label="Waive penal interest" variant="secondary" fullWidth onPress={() => router.push(`/staff/member/${m.id}/waive`)} /> : null}
          {notices.data?.defaulter.isDefaulter ? <StaffDocument title="Defaulter notice" fileName={documentFileName('Defaulter-notice', m.generalNo)} build={async (o) => defaulterNoticeHtml(await api.reports.defaulterNotice(m.id), o)} /> : null}
        </Section>
      ) : null}

      <Expand title="Overview" initiallyOpen>
        <MetadataListItem label="Father's name" value={m.fatherName} />
        <MetadataListItem label="Date of birth" value={`${formatDisplayDate(m.dob)} · ${d.ageYears} yrs`} />
        <MetadataListItem label="Gender" value={m.gender === 'F' ? 'Female' : 'Male'} />
        <MetadataListItem label="Caste" value={m.caste ?? 'Not recorded'} />
        <MetadataListItem label="Mobile" value={`${m.mobile}${d.can.seeFullMobile ? '' : ' (masked for your role)'}`} />
        <MetadataListItem label="Email" value={m.email || '—'} />
        <MetadataListItem label="Employee ID" value={m.employeeId} />
        <MetadataListItem label="Present address" value={address(m.presentAddress)} />
        <MetadataListItem label="Permanent address" value={JSON.stringify(m.permanentAddress) === JSON.stringify(m.presentAddress) ? 'Same as present address' : address(m.permanentAddress)} />
        <MetadataListItem label="Date of joining service" value={formatDisplayDate(m.doj)} />
        <MetadataListItem label="Employment type" value={m.employmentType === 'REGULAR' ? 'Regular' : 'Approved probationer'} />
        <MetadataListItem label="Date of retirement" value={formatDisplayDate(m.dor)} />
        <MetadataListItem label="Left-over service" value={d.leftover.label} />
        <MetadataListItem label="Joined the society" value={formatDisplayDate(m.joinedSocietyOn)} />
        <MetadataListItem label="Department DDO" value={d.department?.ddoName ?? '—'} />
        <MetadataListItem label="Member app" value={m.portalActivated ? 'Activated' : 'Not activated yet'} />
        <MetadataListItem label="Nominee" value={`${m.nominee.name} (${m.nominee.relation})`} />
        <MetadataListItem label="Anniversary" value={m.anniversaryDate ? formatDisplayDate(m.anniversaryDate) : '—'} />
      </Expand>

      <Expand title="Pay profile">
        <Text type="supporting" tone="secondary">
          {m.payProfile.certifiedAt ? `Certified ${formatDisplayDate(m.payProfile.certifiedAt)}` : 'Not certified'}
        </Text>
        <MetadataListItem label="Scale of pay" value={m.payProfile.scaleOfPay || '—'} />
        <MetadataListItem label="Gross salary" value={formatINR(m.payProfile.grossSalary)} />
        <MetadataListItem label="Substantive pay" value={formatINR(m.payProfile.substantivePay)} />
        <MetadataListItem label="Government loan deductions" value={formatINR(m.payProfile.govtLoanDeductions)} />
        <MetadataListItem label="Other loan deductions" value={formatINR(m.payProfile.otherLoanDeductions)} />
      </Expand>

      <Expand title="Service history">
        {d.serviceEvents.length ? (
          <StageTracker stages={d.serviceEvents.map((e) => ({ key: e.id, title: EVENT_LABEL[e.type], description: `${e.summary}${e.effectiveCycle ? ` · demand sheet from ${formatCycle(e.effectiveCycle)}` : ''}${e.byName ? ` · ${e.byName}` : ''}`, date: formatDisplayDate(e.date), status: 'done' as const }))} />
        ) : (
          <Text type="supporting" tone="secondary">
            No service events yet.
          </Text>
        )}
      </Expand>

      <Expand title="Loans & sureties">
        <Text type="label">Own loans</Text>
        <LoanRows rows={d.loans} empty="No loans yet." />
        <Text type="label">Surety for</Text>
        <LoanRows rows={d.guarantees} empty="Not a surety on any loan." guarantee />
      </Expand>

      <Expand title="Deposits">
        {d.deposits.length ? (
          d.deposits.map((x) => (
            <Card key={x.id} onPress={x.scheme === 'FD' ? () => router.push(`/staff/deposit/${x.id}`) : undefined}>
              <View style={{ gap: spacing[1] }}>
                <Text type="label">{SCHEME_LABEL[x.scheme] ?? x.scheme}</Text>
                <Text type="supporting" tone="secondary">
                  {x.accountNo} · opened {formatDisplayDate(x.openedOn)}
                </Text>
                <Text type="supporting" tone="secondary">
                  {x.scheme === 'FD' ? `Principal ${formatINR(x.principal ?? 0)}` : x.monthlyAmount ? `Monthly ${formatINR(x.monthlyAmount)}` : `${x.ratePercent}%`} · {x.maturityDate ? `matures ${formatDisplayDate(x.maturityDate)}` : `balance ${formatINR(x.balance)}`}
                </Text>
                <StatusToken entity="deposit" status={x.status} audience="staff" size="xs" />
              </View>
            </Card>
          ))
        ) : (
          <Text type="supporting" tone="secondary">
            No deposit accounts.
          </Text>
        )}
      </Expand>

      <Expand title="Ledger">
        {d.ledger.length ? (
          d.ledger.map((r) => (
            <View key={`${r.cycle}-${r.departmentName}`} style={{ gap: spacing[0.5], paddingVertical: spacing[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] }}>
                <Text type="label" style={{ flex: 1 }}>
                  {formatCycle(r.cycle)}
                </Text>
                <StatusToken entity="demandSheet" status={r.sheetStatus} audience="staff" size="xs" />
              </View>
              <Text type="supporting" tone="secondary">
                {r.departmentName} · demand {formatINR(r.demand)} · recovered {r.recovered === undefined ? '—' : formatINR(r.recovered)}
              </Text>
            </View>
          ))
        ) : (
          <Text type="supporting" tone="secondary">
            No demand sheets include this member yet.
          </Text>
        )}
      </Expand>

      <Expand title="Documents" badge={d.documents.length ? <Token text={String(d.documents.length)} status="neutral" size="xs" /> : undefined}>
        <Documents d={d} />
      </Expand>

      <Expand title="Change requests" badge={pending ? <Token text={String(pending)} status="warning" size="xs" /> : undefined}>
        {d.changeRequests.length ? (
          d.changeRequests.map((r) => (
            <View key={r.id} style={{ gap: spacing[1], paddingVertical: spacing[1] }}>
              <StatusToken entity="changeRequest" status={r.status} audience="staff" size="xs" />
              {r.fields.map((f) => (
                <Text key={f.field} type="body" tone="secondary">
                  {fieldLabel(f)}: {changeValue(f, f.oldValue)} → {changeValue(f, f.newValue)}
                </Text>
              ))}
              <Text type="supporting" tone="secondary">
                “{r.reason}” · {formatDisplayDateTime(r.createdAt)}
                {r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text type="supporting" tone="secondary">
            No profile change requests from this member.
          </Text>
        )}
        <Link label="Open change requests" onPress={() => router.push('/staff/change-requests')} />
      </Expand>

      <View style={{ gap: spacing[1.5] }}>
        <StaffDocument title="F5 agreement (to the Secretary)" fileName={documentFileName('F5', m.generalNo)} build={(o) => agreementHtml(d, 'A', o)} />
        <StaffDocument title="F6 agreement (to the pay officer)" fileName={documentFileName('F6', m.generalNo)} build={(o) => agreementHtml(d, 'B', o)} />
        <StaffDocument title="F1 membership form" fileName={documentFileName('F1', m.generalNo)} build={(o) => membershipFormHtml(membershipFromMember(d), o)} />
      </View>
    </Screen>
  );
}

/** G1 (D-111): uploaded documents; office staff add photos. */
function Documents({ d }: { d: MemberDetail }) {
  const action = useAction();
  const [type, setType] = useState(REQUIRED_DOCUMENTS[0]!.type);
  const add = () =>
    void action.run(async () => {
      const picked = await pickDocumentImage();
      if (picked) await api.documents.uploadFor(d.member.id, { type, ...picked });
    });
  return (
    <View style={{ gap: spacing[2] }}>
      {d.documents.length ? (
        d.documents.map((doc) => (
          <View key={doc.fileId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View style={{ flex: 1, gap: spacing[0.5] }}>
              <Text type="body" weight="medium">{doc.label}</Text>
              <Text type="supporting" tone="secondary">
                {doc.fileName} · {formatDisplayDate(doc.uploadedOn)} · {doc.uploadedBy}
              </Text>
            </View>
            <FileButton fileId={doc.fileId} mime={doc.mime} consolePath={`/members/${d.member.id}`} />
          </View>
        ))
      ) : (
        <Text type="supporting" tone="secondary">
          No documents on file. Papers from before the app are in the office file.
        </Text>
      )}
      {d.can.edit && (
        <View style={{ gap: spacing[1.5] }}>
          <SelectField label="Add a document" value={type} options={REQUIRED_DOCUMENTS.map((x) => ({ value: x.type, label: x.label }))} onChange={(v) => setType(v as typeof type)} />
          <Button label="Choose a photo" variant="secondary" icon={FileUp} fullWidth loading={action.busy} onPress={add} />
        </View>
      )}
      <ActionAlert action={action} />
    </View>
  );
}
