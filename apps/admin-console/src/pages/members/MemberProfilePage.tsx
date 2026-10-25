// ST-12 Member profile: header with quick actions, tabs for overview, service history, loans and
// sureties, deposits, month-wise ledger, documents and change requests; the recovery mandate on
// the right (DDO agrees it after a transfer, BR-028). Transfer opens ST-13.
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, BadgeCheck, CalendarClock, FileImage, FileText, FlaskConical, Pencil, Printer, ShieldAlert, UserX } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  SnackbarV2Variant,
  TabsV2,
  TabsV2Content,
  TabsV2List,
  TabsV2Trigger,
  TabsV2Variant,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  TooltipV2,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatCycle, formatDisplayDate, formatDisplayDateTime } from '@tgs/domain';
import type { MemberDetail, MemberLoanRow } from '@tgs/types';
import { Money } from '@/components/Money';
import { Panel } from '@/components/Panel';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { changeValue, EVENT_META, fieldLabel, MANDATE_LABEL, retiringLabel } from './members';
import { TransferDrawer } from './TransferDrawer';
import { Initials } from '@/components/Initials';

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body text-fg">{children || '—'}</dd>
    </div>
  );
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-card border border-line px-4 py-3">
      <p className="text-caption text-fg-tertiary">{label}</p>
      <p className="mt-1 text-card-title text-fg">{children}</p>
      {hint && <p className="mt-0.5 text-caption text-fg-tertiary">{hint}</p>}
    </div>
  );
}

const address = (a: { line1: string; line2?: string; city: string; district: string; pincode: string }) => [a.line1, a.line2, a.city, a.district, a.pincode].filter(Boolean).join(', ');

function OverviewTab({ d }: { d: MemberDetail }) {
  const m = d.member;
  const outstanding = d.loans.filter((l) => l.status === 'ACTIVE' || l.status === 'SANCTIONED').reduce((s, l) => s + l.outstanding, 0);
  const deposits = d.deposits.filter((x) => x.status === 'ACTIVE').reduce((s, x) => s + (x.scheme === 'FD' ? (x.principal ?? 0) : x.balance), 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Share capital" hint={`${d.shares?.numberOfShares ?? m.numberOfShares} shares`}>
          <Money value={d.shares?.shareCapital ?? 0} />
        </Stat>
        <Stat label="Share deposit" hint="From loan deductions (BR-004)">
          <Money value={d.shares?.shareDepositBalance ?? 0} />
        </Stat>
        <Stat label="Deposits held" hint={`${d.deposits.filter((x) => x.status === 'ACTIVE').length} accounts`}>
          <Money value={deposits} />
        </Stat>
        <Stat label="Loans outstanding" hint={`${d.loans.filter((l) => l.status === 'ACTIVE').length} active`}>
          <Money value={outstanding} />
        </Stat>
      </div>
      <dl className="grid gap-x-6 gap-y-4 rounded-card border border-line px-4 py-4 sm:grid-cols-2">
        <Field label="Father's name">{m.fatherName}</Field>
        <Field label="Date of birth">{`${formatDisplayDate(m.dob)} · ${d.ageYears} yrs`}</Field>
        <Field label="Gender">{m.gender === 'F' ? 'Female' : 'Male'}</Field>
        <Field label="Mobile">
          <span className="tabular">{m.mobile}</span>
          {!d.can.seeFullMobile && <span className="ml-2 text-caption text-fg-tertiary">(masked for your role)</span>}
        </Field>
        <Field label="Email">{m.email}</Field>
        <Field label="Employee ID">{m.employeeId}</Field>
        <Field label="Present address" wide>
          {address(m.presentAddress)}
        </Field>
        <Field label="Permanent address" wide>
          {JSON.stringify(m.permanentAddress) === JSON.stringify(m.presentAddress) ? 'Same as present address' : address(m.permanentAddress)}
        </Field>
        <Field label="Date of joining service">{formatDisplayDate(m.doj)}</Field>
        <Field label="Employment type">{m.employmentType === 'REGULAR' ? 'Regular' : 'Approved probationer'}</Field>
        <Field label="Date of retirement">{formatDisplayDate(m.dor)}</Field>
        <Field label="Left-over service">{d.leftover.label}</Field>
        <Field label="Joined the society">{formatDisplayDate(m.joinedSocietyOn)}</Field>
        <Field label="Member app">{m.portalActivated ? 'Activated' : 'Not activated yet'}</Field>
        <Field label="Nominee">{`${m.nominee.name} (${m.nominee.relation})`}</Field>
        <Field label="Anniversary">{m.anniversaryDate ? formatDisplayDate(m.anniversaryDate) : ''}</Field>
      </dl>
      <section className="rounded-card border border-line px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-label text-fg">Pay profile</h3>
          <span className="text-caption text-fg-tertiary">{m.payProfile.certifiedAt ? `Certified ${formatDisplayDate(m.payProfile.certifiedAt)}` : 'Not certified'}</span>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Scale of pay">{m.payProfile.scaleOfPay}</Field>
          <Field label="Gross salary">
            <Money value={m.payProfile.grossSalary} />
          </Field>
          <Field label="Substantive pay">
            <Money value={m.payProfile.substantivePay} />
          </Field>
          <Field label="Government loan deductions">
            <Money value={m.payProfile.govtLoanDeductions} />
          </Field>
          <Field label="Other loan deductions">
            <Money value={m.payProfile.otherLoanDeductions} />
          </Field>
        </dl>
      </section>
    </div>
  );
}

function HistoryTab({ d }: { d: MemberDetail }) {
  if (!d.serviceEvents.length) return <p className="text-caption text-fg-tertiary">No service events yet.</p>;
  return (
    <ol className="relative flex flex-col gap-5 border-l border-line pl-6">
      {d.serviceEvents.map((e) => {
        const meta = EVENT_META[e.type];
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[37px] top-0 flex size-7 items-center justify-center rounded-pill border border-line bg-surface text-brand-text">
              <meta.icon size={14} aria-hidden />
            </span>
            <p className="text-label text-fg">{meta.label}</p>
            <p className="text-body text-fg-secondary">{e.summary}</p>
            <p className="mt-0.5 text-caption text-fg-tertiary">
              {formatDisplayDate(e.date)}
              {e.effectiveCycle ? ` · demand sheet from ${formatCycle(e.effectiveCycle)}` : ''}
              {e.byName ? ` · ${e.byName}` : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function LoanList({ rows, empty, guarantee }: { rows: MemberLoanRow[]; empty: string; guarantee?: boolean }) {
  if (!rows.length) return <p className="rounded-control border border-dashed border-line px-4 py-6 text-center text-caption text-fg-tertiary">{empty}</p>;
  return (
    <ul className="divide-y divide-line-subtle rounded-card border border-line">
      {rows.map((l) => (
        <li key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <div className="min-w-0">
            <p className="truncate text-label text-fg">{guarantee && l.borrower ? `${l.borrower.name} (No. ${l.borrower.generalNo})` : l.productName}</p>
            <p className="tabular truncate text-caption text-fg-tertiary">
              {guarantee ? `${l.productName} · ` : ''}
              {l.loanNo ?? l.applicationNo} · applied {formatDisplayDate(l.appliedOn)}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-caption text-fg-tertiary">Amount</p>
            <Money value={l.amount} className="text-body" />
          </div>
          <div className="hidden sm:block">
            <p className="text-caption text-fg-tertiary">Outstanding{l.emi ? ' · EMI' : ''}</p>
            <p className="text-body">
              <Money value={l.outstanding} />
              {l.emi ? (
                <span className="text-caption text-fg-tertiary">
                  {' '}
                  · <Money value={l.emi} />
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusTag entity="loan" status={l.status} size={TagV2Size.XS} />
            {guarantee && l.suretyStatus && <StatusTag entity="surety" status={l.suretyStatus} size={TagV2Size.XS} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

const SCHEME_LABEL: Record<string, string> = { FD: 'Fixed deposit', CRD: 'CRD', SRDS: 'SRDS', SAVINGS: 'Savings' };

function DepositsTab({ d }: { d: MemberDetail }) {
  if (!d.deposits.length) return <p className="text-caption text-fg-tertiary">No deposit accounts.</p>;
  return (
    <ul className="divide-y divide-line-subtle rounded-card border border-line">
      {d.deposits.map((x) => (
        <li key={x.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
          <div>
            <p className="text-label text-fg">{SCHEME_LABEL[x.scheme] ?? x.scheme}</p>
            <p className="tabular text-caption text-fg-tertiary">
              {x.accountNo} · opened {formatDisplayDate(x.openedOn)}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-caption text-fg-tertiary">{x.scheme === 'FD' ? 'Principal' : x.monthlyAmount ? 'Monthly' : 'Rate'}</p>
            <p className="text-body">{x.scheme === 'FD' ? <Money value={x.principal ?? 0} /> : x.monthlyAmount ? <Money value={x.monthlyAmount} /> : `${x.ratePercent}%`}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-caption text-fg-tertiary">{x.maturityDate ? `Matures ${formatDisplayDate(x.maturityDate)}` : 'Balance'}</p>
            <Money value={x.balance} className="text-body" />
          </div>
          <StatusTag entity="deposit" status={x.status} size={TagV2Size.XS} />
        </li>
      ))}
    </ul>
  );
}

function LedgerTab({ d }: { d: MemberDetail }) {
  if (!d.ledger.length) return <p className="text-caption text-fg-tertiary">No demand sheets include this member yet.</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full text-left">
        <thead className="bg-surface-subtle text-caption text-fg-tertiary">
          <tr>
            <th className="px-4 py-2 font-medium">Month</th>
            <th className="px-4 py-2 font-medium">Department</th>
            <th className="px-4 py-2 text-right font-medium">Demand</th>
            <th className="px-4 py-2 text-right font-medium">Recovered</th>
            <th className="px-4 py-2 font-medium">Sheet</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle text-body">
          {d.ledger.map((r) => {
            const short = r.recovered !== undefined && r.recovered < r.demand;
            return (
              <tr key={`${r.cycle}-${r.departmentName}`}>
                <td className="whitespace-nowrap px-4 py-2">{formatCycle(r.cycle)}</td>
                <td className="px-4 py-2 text-fg-secondary">{r.departmentName}</td>
                <td className="px-4 py-2 text-right">
                  <Money value={r.demand} />
                </td>
                <td className={cn('px-4 py-2 text-right', short && 'text-danger-fg')}>{r.recovered === undefined ? <span className="text-fg-tertiary">—</span> : <Money value={r.recovered} />}</td>
                <td className="px-4 py-2">
                  <StatusTag entity="demandSheet" status={r.sheetStatus} size={TagV2Size.XS} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsTab({ d }: { d: MemberDetail }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {d.documents.map((doc) => {
        const Icon = doc.type === 'PHOTO' ? FileImage : FileText;
        return (
          <li key={doc.type} className="flex items-center gap-3 rounded-card border border-line px-4 py-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-brand-text">
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-label text-fg">{doc.label}</p>
              <p className="truncate text-caption text-fg-tertiary">
                {doc.fileName} · {formatDisplayDate(doc.uploadedOn)} · {doc.uploadedBy}
              </p>
            </div>
          </li>
        );
      })}
      <li className="text-caption text-fg-tertiary sm:col-span-2">Prototype: documents are simulated, so there is no preview or download.</li>
    </ul>
  );
}

function RequestsTab({ d }: { d: MemberDetail }) {
  if (!d.changeRequests.length) return <p className="text-caption text-fg-tertiary">No profile change requests from this member.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {d.changeRequests.map((r) => (
        <li key={r.id} className="rounded-card border border-line px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label text-fg">{r.fields.map(fieldLabel).join(', ')}</p>
            <StatusTag entity="changeRequest" status={r.status} size={TagV2Size.XS} />
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-body">
            {r.fields.map((f) => (
              <li key={f.field} className="text-fg-secondary">
                {fieldLabel(f)}: <span className="line-through">{changeValue(f, f.oldValue)}</span> → <span className="text-fg">{changeValue(f, f.newValue)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-caption text-fg-tertiary">
            “{r.reason}” · {formatDisplayDateTime(r.createdAt)}
            {r.decidedByName ? ` · decided by ${r.decidedByName}` : ''}
          </p>
        </li>
      ))}
      <li>
        <Link to="/members/change-requests" className="text-caption text-link hover:underline">
          Open change requests
        </Link>
      </li>
    </ul>
  );
}

export function MemberProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [transfer, setTransfer] = useState(false);
  const q = useQuery({ queryKey: ['member', id], queryFn: () => api.members.get(id), retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const demo = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const agree = useMutation({
    mutationFn: () => api.members.agreeMandate(id),
    onSuccess: (next) => {
      qc.setQueryData(['member', id], next);
      void qc.invalidateQueries({ queryKey: ['members'] });
      addSnackbarV2({ header: 'Mandate agreed', description: `${next.mandate?.agreedByName ?? ''} · salary recovery continues from ${next.department?.name ?? ''}`, variant: SnackbarV2Variant.SUCCESS });
    },
    onError: (e) => addSnackbarV2({ header: "Couldn't agree", description: isApiError(e) ? e.message : 'Try again.', variant: SnackbarV2Variant.ERROR }),
  });

  const d = q.data;
  const m = d?.member;
  const notFound = isApiError(q.error) && q.error.status === 404;
  const soon = d && m ? retiringLabel(d.leftover.months, m.status) : undefined;
  const pendingRequests = d?.changeRequests.filter((r) => r.status === 'PENDING').length ?? 0;
  const activeLoans = d?.loans.filter((l) => l.status === 'ACTIVE').length ?? 0;

  return (
    <>
      <ButtonV2 text="Members" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/members')} />
      <ViewState
        state={q.isLoading ? 'loading' : notFound ? 'empty' : q.isError ? 'error' : 'ready'}
        layout="detail"
        onRetry={() => void q.refetch()}
        empty={{ icon: UserX, title: 'Member not found', description: 'They may be outside your department, or the demo data was reset.', action: { label: 'Back to Members', onClick: () => navigate('/members') } }}
      >
        {d && m && (
          <div className="mt-3 flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Initials name={m.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-page-title text-fg">{m.name}</h1>
                    <StatusTag entity="member" status={m.status} size={TagV2Size.MD} />
                    <TagV2 text={activeLoans ? 'Loanee' : 'Non-loanee'} size={TagV2Size.SM} color={activeLoans ? TagV2Color.PRIMARY : TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                    {soon && <TagV2 text={soon} size={TagV2Size.SM} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
                  </div>
                  <p className="mt-1 text-body text-fg-secondary">
                    <span className="tabular">General No. {m.generalNo}</span> · {m.designation} · {d.department?.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.can.transfer && <ButtonV2 text="Transfer" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <ArrowRightLeft size={16} /> }} onClick={() => setTransfer(true)} />}
                {d.can.edit && <ButtonV2 text="Edit" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={16} /> }} onClick={() => navigate(`/members/${m.id}/edit`)} />}
              </div>
            </header>

            {d.upcomingTransfer && (
              <AlertV2
                type={AlertV2Type.PRIMARY}
                subType={AlertV2SubType.SUBTLE}
                heading={`Moves to the ${d.upcomingTransfer.toDepartmentName} demand sheet from ${formatCycle(d.upcomingTransfer.effectiveCycle)}`}
                description={`Transferred from ${d.upcomingTransfer.fromDepartmentName}. Sheets already generated stay with the old department (BR-010).`}
              />
            )}
            {d.dorWarning && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Check the date of retirement" description={d.dorWarning} slot={{ slot: <CalendarClock size={16} /> }} />}

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="min-w-0 rounded-card border border-line bg-surface px-5 pb-5 pt-2 shadow-raised xl:col-span-2">
                <TabsV2 value={tab} onValueChange={setTab}>
                  <TabsV2List variant={TabsV2Variant.UNDERLINE}>
                    {([
                      ['overview', 'Overview'],
                      ['history', 'Service history'],
                      ['loans', 'Loans & sureties'],
                      ['deposits', 'Deposits'],
                      ['ledger', 'Ledger'],
                      ['documents', 'Documents'],
                    ] as const).map(([v, label]) => (
                      <TabsV2Trigger key={v} value={v} variant={TabsV2Variant.UNDERLINE}>
                        {label}
                      </TabsV2Trigger>
                    ))}
                    <TabsV2Trigger value="requests" variant={TabsV2Variant.UNDERLINE} rightSlot={pendingRequests ? <span className="tabular rounded-pill bg-warning-bg px-1.5 text-caption-strong text-warning-fg">{pendingRequests}</span> : undefined}>
                      Requests
                    </TabsV2Trigger>
                  </TabsV2List>
                  <div className="pt-5">
                    <TabsV2Content value="overview">
                      <OverviewTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="history">
                      <HistoryTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="loans">
                      <div className="flex flex-col gap-5">
                        <section>
                          <h3 className="mb-2 text-label text-fg">Own loans</h3>
                          <LoanList rows={d.loans} empty="No loans yet." />
                        </section>
                        <section>
                          <h3 className="mb-2 text-label text-fg">Surety for</h3>
                          <LoanList rows={d.guarantees} empty="Not a surety on any loan." guarantee />
                        </section>
                      </div>
                    </TabsV2Content>
                    <TabsV2Content value="deposits">
                      <DepositsTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="ledger">
                      <LedgerTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="documents">
                      <DocumentsTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="requests">
                      <RequestsTab d={d} />
                    </TabsV2Content>
                  </div>
                </TabsV2>
              </div>

              <div className="flex flex-col gap-5 xl:self-start">
                <Panel title="Salary recovery mandate" subtitle="Paper forms F5 / F6 (BR-028)">
                  {d.mandate ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-pill', d.mandate.status === 'AGREED' ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                          {d.mandate.status === 'AGREED' ? <BadgeCheck size={18} aria-hidden /> : <ShieldAlert size={18} aria-hidden />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-label text-fg">{MANDATE_LABEL[d.mandate.status]}</p>
                          <p className="text-caption text-fg-secondary">
                            {d.mandate.status === 'AGREED' ? `${d.mandate.agreedByName ?? 'DDO'} · ${formatDisplayDate(d.mandate.agreedOn ?? d.mandate.signedOn)}` : `${d.department?.ddoName ?? 'The DDO'} (${d.department?.name ?? ''}) has not agreed yet. New loans show a warning.`}
                          </p>
                        </div>
                      </div>
                      {d.can.agreeMandate && <ButtonV2 text="Agree mandate" buttonType={ButtonV2Type.PRIMARY} width="100%" loading={agree.isPending} onClick={() => agree.mutate()} />}
                      {d.demoAgreeAs && (
                        <TooltipV2 content="Demo control: records the agreement for a DDO who has no login in the demo.">
                          <span>
                            <ButtonV2 text={`Act as ${d.demoAgreeAs}`} buttonType={ButtonV2Type.SECONDARY} width="100%" leftSlot={{ slot: <FlaskConical size={16} /> }} loading={agree.isPending} onClick={() => agree.mutate()} />
                          </span>
                        </TooltipV2>
                      )}
                    </div>
                  ) : (
                    <p className="text-body text-fg-secondary">No mandate on record.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ButtonV2 text="Print F5" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Printer size={14} /> }} onClick={() => navigate(`/reports/print/agreement?member=${d.member.id}&version=A`)} />
                    <ButtonV2 text="Print F6" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Printer size={14} /> }} onClick={() => navigate(`/reports/print/agreement?member=${d.member.id}&version=B`)} />
                    <ButtonV2 text="Print F1" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Printer size={14} /> }} onClick={() => navigate(`/reports/print/membership?member=${d.member.id}`)} />
                  </div>
                </Panel>
                <Panel title="At a glance">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Left-over service">{d.leftover.label}</Field>
                    <Field label="Retires on">{formatDisplayDate(m.dor)}</Field>
                    <Field label="Department DDO">{d.department?.ddoName}</Field>
                    <Field label="Shares">{String(d.shares?.numberOfShares ?? m.numberOfShares)}</Field>
                    <Field label="Surety on">{`${d.guarantees.filter((g) => g.status === 'ACTIVE').length} active loan(s)`}</Field>
                    <Field label="Member app">{m.portalActivated ? 'Active' : 'Not yet'}</Field>
                  </dl>
                </Panel>
              </div>
            </div>
            <TransferDrawer detail={d} open={transfer} onClose={() => setTransfer(false)} today={demo.data?.today ?? m.joinedSocietyOn} />
          </div>
        )}
      </ViewState>
    </>
  );
}
