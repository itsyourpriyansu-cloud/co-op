// ST-23 Loan detail: header + stage stepper (MB-04 labels), tabs for the F2/F3 application,
// eligibility (re-run live), sureties (items 9–10), repayment schedule and activity. The decision
// drawers (ST-24 … ST-28) arrive with M5; the "Next step" panel names who acts.
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Clock, FileSearch, FileText, FlaskConical, Printer, ShieldCheck } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  AvatarV2,
  AvatarV2Size,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  StepperV2,
  StepperV2StepStatus,
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
  Timeline,
  TimelineHeader,
  TimelineNodeStatus,
  TimelineSubstep,
  TooltipV2,
  SnackbarV2Variant,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ROLE_LABELS, type LoanDetail, type Role } from '@tgs/types';
import { Money } from '@/components/Money';
import { Panel } from '@/components/Panel';
import { RuleCheckList } from '@/components/RuleCheckList';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { LoanActionDrawer, SanctionSheetView } from './LoanActionDrawer';
import { ACTION_LABEL, formFor } from './loans';

const SECONDARY = new Set(['returnToMember', 'reject', 'sendBack']);

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body text-fg">{children || '—'}</dd>
    </div>
  );
}

function ApplicationTab({ d }: { d: LoanDetail }) {
  const l = d.loan;
  const f = l.form ?? {};
  const pay = f.pay;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-4 rounded-card border border-line px-4 py-4 sm:grid-cols-2">
        <Field label="7a · Amount required" wide>
          <Money value={l.appliedAmount} /> <span className="text-caption text-fg-tertiary">({amountInWords(l.appliedAmount)})</span>
        </Field>
        <Field label="7b · Purpose">{l.purpose}</Field>
        <Field label="11 · Monthly instalments">{`${l.appliedInstalments} months at ${l.ratePercent}% a year`}</Field>
        {f.education && (
          <Field label="Education" wide>
            {`${f.education.studentName} (${f.education.relation}) · ${f.education.course}, ${f.education.institution}`}
          </Field>
        )}
        {d.product.code !== 'SALARY' && <Field label="8 · Security">{d.pledgedDeposit ? `Pledge of FD ${d.pledgedDeposit.accountNo} (${formatINR(d.pledgedDeposit.principal)})` : f.security?.type === 'OTHER' ? (f.security.description ?? 'Other') : d.sureties.length ? `${d.sureties.length} sureties` : '—'}</Field>}
        {f.additionalShares ? <Field label="6c · Additional shares proposed">{String(f.additionalShares)}</Field> : null}
        <Field label="Entered">{l.channel === 'COUNTER' ? `By ${l.createdByName ?? 'the office'} from the paper form` : 'By the member in the app'}</Field>
        <Field label="Signed">{l.signature ? `With OTP · ${formatDisplayDateTime(l.signature.signedAt)} · text ${l.signature.textVersion}` : l.channel === 'COUNTER' ? 'On paper' : 'Not yet'}</Field>
      </dl>

      {pay && (
        <section className="rounded-card border border-line px-4 py-4">
          <h3 className="mb-3 text-label text-fg">Items 4–5 · Pay details (DDO certifies)</h3>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Scale of pay">{pay.scaleOfPay}</Field>
            <Field label="5a · Gross salary">
              <Money value={pay.grossSalary} />
            </Field>
            <Field label="5b · Govt loan deductions">
              <Money value={pay.govtLoanDeductions} />
            </Field>
            <Field label="5c · Other loan deductions">
              <Money value={pay.otherLoanDeductions} />
            </Field>
            <Field label="5d · Total deductions">
              <Money value={pay.govtLoanDeductions + pay.otherLoanDeductions} />
            </Field>
            <Field label="5e · Net salary">
              <Money value={d.preview.netSalary} />
            </Field>
          </dl>
        </section>
      )}

      {l.sanctionSheet && (
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg">For office use · sanction sheet</h3>
          <SanctionSheetView sheet={l.sanctionSheet} />
        </section>
      )}

      {f.salary && (
        <section className="rounded-card border border-line px-4 py-4">
          <h3 className="mb-3 text-label text-fg">Form F3 · Pay this month</h3>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="5 · Substantive pay">
              <Money value={f.salary.substantivePay} />
            </Field>
            <Field label="6 · Compulsory deductions" wide>
              {f.salary.compulsoryDeductions.length ? f.salary.compulsoryDeductions.map((x) => `${x.label} ${formatINR(x.amount)}`).join(' · ') : 'None'}
            </Field>
            <Field label="9 · Net pay earned to date">
              <Money value={f.salary.netPayEarnedToDate} />
            </Field>
          </dl>
        </section>
      )}
    </div>
  );
}

function SuretiesTab({ d }: { d: LoanDetail }) {
  if (!d.product.suretiesRequired) return <p className="text-body text-fg-secondary">{d.product.name} does not need sureties.</p>;
  if (!d.sureties.length) return <p className="text-caption text-fg-tertiary">No sureties chosen yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      {d.sureties.map((s) => {
        const warn = s.checks.find((c) => !c.pass && c.severity === 'warn');
        const block = s.checks.find((c) => !c.pass && c.severity === 'block');
        return (
          <section key={s.memberId} className="rounded-card border border-line">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
              <div className="min-w-0">
                <Link to={`/members/${s.memberId}`} className="text-label text-fg hover:text-brand-text hover:underline">
                  {s.name}
                </Link>
                <p className="text-caption text-fg-tertiary">
                  No. {s.generalNo} · {s.designation} · {s.departmentName}
                </p>
              </div>
              {s.status ? <StatusTag entity="surety" status={s.status} size={TagV2Size.XS} /> : null}
            </header>
            <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
              <Field label="(d) Date of birth">{formatDisplayDate(s.dob)}</Field>
              <Field label="(e) Substantive pay">
                <Money value={s.substantivePay} />
              </Field>
              <Field label="(j) Shares held">{String(s.numberOfShares)}</Field>
              <Field label="(l) Retires">{`${formatDisplayDate(s.dor)} · ${s.leftoverLabel} left`}</Field>
            </dl>
            {(warn || block) && (
              <p className={cn('mx-4 mb-3 flex items-start gap-2 rounded-control px-3 py-2 text-caption', block ? 'bg-danger-bg text-danger-fg' : 'bg-warning-bg text-warning-fg')}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {(block ?? warn)!.message}
              </p>
            )}
            <div className="border-t border-line-subtle px-4 py-3">
              <p className="mb-1 text-caption text-fg-tertiary">Item 10 · Already a surety for</p>
              {s.guarantees.length ? (
                <ul className="flex flex-col gap-1 text-caption text-fg-secondary">
                  {s.guarantees.map((g) => (
                    <li key={g.applicationNo}>
                      {g.borrower} (No. {g.generalNo}) · {g.product} · {g.applicationNo} · outstanding {formatINR(g.outstanding)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-fg-secondary">No other loans.</p>
              )}
            </div>
            {s.declineReason && <p className="border-t border-line-subtle px-4 py-3 text-caption text-danger-fg">Declined: {s.declineReason}</p>}
          </section>
        );
      })}
    </div>
  );
}

function ScheduleTab({ d }: { d: LoanDetail }) {
  const rows = d.loan.schedule;
  if (!rows.length)
    return (
      <p className="text-body text-fg-secondary">
        The schedule is fixed at sanction. Expected now: first instalment <Money value={d.preview.emi} />
        {d.preview.lastInstalment !== d.preview.emi ? (
          <>
            , last <Money value={d.preview.lastInstalment} />
          </>
        ) : null}
        , total interest <Money value={d.preview.totalInterest} />.
      </p>
    );
  return (
    <div className="max-h-[480px] overflow-auto rounded-card border border-line">
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-surface-subtle text-caption text-fg-tertiary">
          <tr>
            {['#', 'Month', 'Opening', 'Interest', 'Principal', 'EMI', 'Closing', 'Paid'].map((h) => (
              <th key={h} className={cn('px-3 py-2 font-medium', h !== '#' && h !== 'Month' && h !== 'Paid' && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle text-body">
          {rows.map((r) => (
            <tr key={r.installmentNo}>
              <td className="px-3 py-1.5 text-fg-tertiary">{r.installmentNo}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{formatCycle(r.dueCycle)}</td>
              {[r.opening, r.interest, r.principal, r.emi, r.closing].map((v, i) => (
                <td key={i} className="px-3 py-1.5 text-right">
                  <Money value={v} />
                </td>
              ))}
              <td className="px-3 py-1.5">{r.paidStatus ? <StatusTag entity="schedule" status={r.paidStatus} size={TagV2Size.XS} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTab({ d }: { d: LoanDetail }) {
  const events = [...d.loan.events].reverse();
  if (!events.length) return <p className="text-caption text-fg-tertiary">No activity yet.</p>;
  return (
    <Timeline>
      {events.map((e, i) => (
        <TimelineHeader key={`${e.at}-${i}`} title={e.action === 'submit' ? 'Application submitted' : (ACTION_LABEL[e.action] ?? e.action)} status={e.toStatus === 'REJECTED' ? TimelineNodeStatus.ERROR : e.toStatus === 'RETURNED' ? TimelineNodeStatus.WARNING : TimelineNodeStatus.SUCCESS} timestamp={formatDisplayDateTime(e.at)}>
          <TimelineSubstep title={`${e.actorName} · ${ROLE_LABELS[e.actorRole as Role] ?? e.actorRole}`} {...(e.remarks ? { description: e.remarks } : {})} />
        </TimelineHeader>
      ))}
    </Timeline>
  );
}

export function LoanDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('application');
  const [drawer, setDrawer] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['loan', id], queryFn: () => api.loans.get(id), refetchInterval: drawer ? false : 5000, retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const demoState = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const demo = useMutation({
    mutationFn: () => api.loans.demoAct(id),
    onSuccess: (next) => {
      qc.setQueryData(['loan', id], next);
      void qc.invalidateQueries({ queryKey: ['loans'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      addSnackbarV2({ header: 'Demo: stage completed', description: next.waitingOn ? `Now with ${next.waitingOn}` : `Now ${next.loan.status.toLowerCase().replace(/_/g, ' ')}`, variant: SnackbarV2Variant.INFO });
    },
    onError: (e) => addSnackbarV2({ header: "Couldn't act", description: isApiError(e) ? e.message : 'Try again.', variant: SnackbarV2Variant.ERROR }),
  });
  const d = q.data;
  const l = d?.loan;
  const notFound = isApiError(q.error) && q.error.status === 404;
  const blocking = d?.checks.filter((c) => !c.pass && c.severity === 'block').length ?? 0;
  const lastEvent = l?.events.at(-1);
  const daysInStage = lastEvent ? Math.max(0, Math.round((Date.now() - Date.parse(lastEvent.at)) / 86_400_000)) : 0;

  return (
    <>
      <ButtonV2 text="Loans" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/loans')} />
      <ViewState
        state={q.isLoading ? 'loading' : notFound ? 'empty' : q.isError ? 'error' : 'ready'}
        layout="detail"
        onRetry={() => void q.refetch()}
        empty={{ icon: FileSearch, title: 'Loan not found', description: 'It may be outside your department, still a draft on the phone, or the demo data was reset.', action: { label: 'Back to Loans', onClick: () => navigate('/loans') } }}
      >
        {d && l && (
          <div className="mt-3 flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <AvatarV2 fallbackText={d.member.name} size={AvatarV2Size.LG} alt={d.member.name} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-page-title text-fg">
                      {d.product.name} · <Money value={l.sanctionedAmount ?? l.appliedAmount} />
                    </h1>
                    <StatusTag entity="loan" status={l.status} size={TagV2Size.MD} />
                    <TagV2 text={`Form ${formFor(l.product)}`} size={TagV2Size.SM} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                  </div>
                  <p className="mt-1 text-body text-fg-secondary">
                    <span className="tabular">{l.loanNo ?? l.applicationNo}</span> ·{' '}
                    <Link to={`/members/${d.member.id}`} className="text-link hover:underline">
                      {d.member.name} (No. {d.member.generalNo})
                    </Link>{' '}
                    · {d.member.departmentName} · applied {formatDisplayDate(l.appliedOn)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {l.status !== 'DRAFT' && l.product !== 'DEPOSIT' && <ButtonV2 text="Print form" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Printer size={16} /> }} onClick={() => navigate(`/reports/print/loan-form?loan=${l.id}`)} />}
                {l.sanctionLetterNo && <ButtonV2 text="Sanction letter" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FileText size={16} /> }} onClick={() => navigate(`/loans/${l.id}/letter`)} />}
                {d.actions.filter((a) => SECONDARY.has(a)).map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.SECONDARY} onClick={() => setDrawer(a)} />
                ))}
                {d.actions.filter((a) => !SECONDARY.has(a)).map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.PRIMARY} onClick={() => setDrawer(a)} />
                ))}
                {d.demoActAs && (
                  <TooltipV2 content="Demo control: completes this stage as the person who owns it, so you can follow the whole flow without switching logins.">
                    <span>
                      <ButtonV2 text={`Act as ${d.demoActAs}`} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FlaskConical size={16} /> }} loading={demo.isPending} onClick={() => demo.mutate()} />
                    </span>
                  </TooltipV2>
                )}
              </div>
            </header>

            {l.status === 'RETURNED' && l.returnInfo && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading={`Returned to the member by ${l.returnInfo.byName}`} description={l.returnInfo.reason} />}
            {l.status === 'REJECTED' && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading={`Rejected${l.rejection ? ` by ${l.rejection.byName}` : ''}`} description={l.rejection?.remarks ?? 'No reason recorded.'} />}
            {l.status === 'ACTIVE' && l.disbursement && (
              <AlertV2 type={AlertV2Type.SUCCESS} subType={AlertV2SubType.SUBTLE} heading={`Disbursed on ${formatDisplayDate(l.disbursement.date)}`} description={`${formatINR(l.disbursement.amount)} by ${l.disbursement.mode} · ref ${l.disbursement.reference} · ${l.disbursement.byName}`} />
            )}

            <div className="overflow-x-auto rounded-card border border-line bg-surface px-5 py-4 shadow-raised">
              <StepperV2
                steps={d.stages.map((s, i) => ({
                  id: i + 1,
                  title: s.title,
                  status: s.status === 'done' ? StepperV2StepStatus.COMPLETED : s.status === 'current' || s.status === 'attention' ? StepperV2StepStatus.CURRENT : StepperV2StepStatus.PENDING,
                }))}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="min-w-0 rounded-card border border-line bg-surface px-5 pb-5 pt-2 shadow-raised xl:col-span-2">
                <TabsV2 value={tab} onValueChange={setTab}>
                  <TabsV2List variant={TabsV2Variant.UNDERLINE}>
                    <TabsV2Trigger value="application" variant={TabsV2Variant.UNDERLINE}>
                      Application
                    </TabsV2Trigger>
                    <TabsV2Trigger value="checks" variant={TabsV2Variant.UNDERLINE} rightSlot={blocking ? <span className="tabular rounded-pill bg-danger-bg px-1.5 text-caption-strong text-danger-fg">{blocking}</span> : undefined}>
                      Eligibility
                    </TabsV2Trigger>
                    <TabsV2Trigger value="sureties" variant={TabsV2Variant.UNDERLINE}>
                      {`Sureties (${d.sureties.length})`}
                    </TabsV2Trigger>
                    <TabsV2Trigger value="schedule" variant={TabsV2Variant.UNDERLINE}>
                      Schedule
                    </TabsV2Trigger>
                    <TabsV2Trigger value="activity" variant={TabsV2Variant.UNDERLINE}>
                      Activity
                    </TabsV2Trigger>
                  </TabsV2List>
                  <div className="pt-5">
                    <TabsV2Content value="application">
                      <ApplicationTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="checks">{d.checks.length ? <RuleCheckList checks={d.checks} /> : <p className="text-body text-fg-secondary">This loan is past sanction, so eligibility is not re-run.</p>}</TabsV2Content>
                    <TabsV2Content value="sureties">
                      <SuretiesTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="schedule">
                      <ScheduleTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="activity">
                      <ActivityTab d={d} />
                    </TabsV2Content>
                  </div>
                </TabsV2>
              </div>

              <div className="flex flex-col gap-5 xl:self-start">
                <Panel title="Next step">
                  {d.actions.length ? (
                    <div className="flex flex-col gap-3">
                      <TagV2 text="Your turn" size={TagV2Size.SM} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                      {d.actions.filter((a) => !SECONDARY.has(a)).map((a) => (
                        <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.PRIMARY} width="100%" onClick={() => setDrawer(a)} />
                      ))}
                    </div>
                  ) : d.waitingOn ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-label text-fg">Waiting on {d.waitingOn}</p>
                      <p className="inline-flex items-center gap-1.5 text-caption text-fg-tertiary">
                        <Clock size={14} aria-hidden /> In this stage for {daysInStage === 0 ? 'less than a day' : `${daysInStage} day${daysInStage === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-body text-fg-secondary">{l.status === 'ACTIVE' ? 'Disbursed and being recovered every month.' : 'No further steps.'}</p>
                  )}
                </Panel>
                <Panel title="Money" subtitle="Live preview from the society's rules">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label={l.emi ? 'EMI' : 'First instalment'}>
                      <Money value={l.emi ?? d.preview.emi} />
                    </Field>
                    <Field label="Total interest">
                      <Money value={d.preview.totalInterest} />
                    </Field>
                    <Field label="Share deposit deduction">
                      <Money value={l.shareDepositDeduction ?? d.preview.shareDeduction} />
                    </Field>
                    <Field label="Net disbursable">
                      <Money value={l.netDisbursable ?? d.preview.netDisbursable} />
                    </Field>
                    {l.status === 'ACTIVE' && (
                      <Field label="Outstanding" wide>
                        <Money value={l.outstandingPrincipal} />
                      </Field>
                    )}
                  </dl>
                </Panel>
                {(l.signOffs?.review || l.signOffs?.ddo || l.signOffs?.assessment) && (
                  <Panel title="Sign-offs" subtitle="Recorded with name and time">
                    <ol className="flex flex-col gap-2.5">
                      {(
                        [
                          ['Review', l.signOffs?.review],
                          [l.signOffs?.ddo?.manual ? `DDO (paper, ${l.signOffs.ddo.manual.reference})` : 'DDO certificate', l.signOffs?.ddo],
                          ['Assessment', l.signOffs?.assessment],
                          ['Secretary', l.signOffs?.secretary],
                          ['President', l.signOffs?.president],
                        ] as Array<[string, { byName: string; at: string } | undefined]>
                      ).map(([label, so]) => (
                        <li key={label} className="flex items-start justify-between gap-3">
                          <span className={cn('text-label', so ? 'text-fg' : 'text-fg-tertiary')}>{label}</span>
                          <span className="text-right text-caption text-fg-secondary">{so ? `${so.byName} · ${formatDisplayDateTime(so.at)}` : '—'}</span>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                )}
                <Panel title="Borrower">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Designation">{d.member.designation}</Field>
                    <Field label="Mobile">{d.member.mobileMasked}</Field>
                    <Field label="Retires on">{formatDisplayDate(d.member.dor)}</Field>
                    <Field label="Left-over service">{d.member.leftover.label}</Field>
                  </dl>
                  {d.parentLoan && (
                    <p className="mt-3 flex items-center gap-1.5 text-caption text-fg-secondary">
                      <ShieldCheck size={14} aria-hidden /> Top-up of {d.parentLoan.loanNo ?? d.parentLoan.applicationNo}
                    </p>
                  )}
                </Panel>
              </div>
            </div>
            <LoanActionDrawer detail={d} action={drawer} onClose={() => setDrawer(null)} today={demoState.data?.today ?? l.appliedOn} />
          </div>
        )}
      </ViewState>
    </>
  );
}
