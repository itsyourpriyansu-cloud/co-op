// ST-15 Membership application detail: the digital F1 form, documents, declarations, checks and
// the audit trail, with the action for the signed-in role (drawers: ActionDrawer).
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, CircleCheck, Clock, FileImage, FileText, FlaskConical, Printer, ShieldCheck, UserX } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  SnackbarV2Variant,
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
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDate, formatDisplayDateTime } from '@tgs/domain';
import { ROLE_LABELS, type MembershipAction, type MembershipDetail, type Role, type WorkflowEvent } from '@tgs/types';
import { Money } from '@/components/Money';
import { Panel } from '@/components/Panel';
import { RuleCheckList } from '@/components/RuleCheckList';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ActionDrawer } from './ActionDrawer';
import { ACTION_LABEL, certItems, isPrimaryAction, STEPS } from './joining';
import { Initials } from '@/components/Initials';

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? (r === 'APPLICANT' ? 'Applicant' : r.charAt(0) + r.slice(1).toLowerCase());

const EVENT_TITLE: Record<string, string> = {
  submit: 'Application submitted',
  resubmit: 'Corrected and resubmitted',
  sendToDdo: 'Sent to the department',
  certify: 'Certified by the DDO',
  forward: 'Recommended by the office',
  approve: 'Approved',
  returnToApplicant: 'Returned to the applicant',
  requestInfo: 'Returned to the applicant',
  reject: 'Rejected',
  recordSharePayment: 'Shares paid · member created',
  activate: 'Activated · shares on first demand',
};

function eventTone(e: WorkflowEvent) {
  if (e.toStatus === 'REJECTED') return TimelineNodeStatus.ERROR;
  if (e.toStatus === 'INFO_REQUESTED') return TimelineNodeStatus.WARNING;
  if (e.actorRole === 'APPLICANT') return TimelineNodeStatus.NEUTRAL;
  return TimelineNodeStatus.SUCCESS;
}

function steps(d: MembershipDetail) {
  const app = d.application;
  // A returned application sits at the stage that returned it.
  const returnedFrom = [...app.events].reverse().find((e) => e.toStatus === 'INFO_REQUESTED')?.fromStatus;
  const at = app.status === 'INFO_REQUESTED' ? returnedFrom : app.status === 'REJECTED' ? app.events.at(-1)?.fromStatus : app.status;
  const idx = STEPS.findIndex((s) => s.status === at);
  return STEPS.map((s, i) => ({
    id: i + 1,
    title: s.title,
    status: app.status === 'ACTIVE' || i < idx ? StepperV2StepStatus.COMPLETED : i === idx ? StepperV2StepStatus.CURRENT : StepperV2StepStatus.PENDING,
  }));
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body text-fg">{children || '—'}</dd>
    </div>
  );
}

function ApplicationTab({ d }: { d: MembershipDetail }) {
  const app = d.application;
  const f = app.form ?? {};
  const certified = Boolean(app.ddoCertification);
  const perm = f.address?.sameAsPresent ? 'Same as present address' : [f.address?.permanent?.line1, f.address?.permanent?.city, f.address?.permanent?.pincode].filter(Boolean).join(', ');
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-line">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
          <h3 className="text-label text-fg">Items 1 to 7 · certified by the DDO</h3>
          {certified ? (
            <span className="inline-flex items-center gap-1.5 text-caption-strong text-success-fg">
              <BadgeCheck size={16} aria-hidden /> {app.ddoCertification?.byName} · {formatDisplayDate((app.ddoCertification?.at ?? '').slice(0, 10))}
            </span>
          ) : (
            <span className="text-caption text-fg-tertiary">Not certified yet</span>
          )}
        </header>
        <ul className="divide-y divide-line-subtle">
          {certItems(app, d.department?.name ?? '').map((r) => (
            <li key={r.key} className="grid grid-cols-[28px_200px_1fr_20px] items-start gap-3 px-4 py-2.5">
              <span className="tabular text-caption-strong text-fg-tertiary">{r.no}</span>
              <span className="text-caption text-fg-secondary">{r.label}</span>
              <span className="text-body text-fg">{r.value}</span>
              {certified && <CircleCheck size={16} className="mt-0.5 text-success-fg" aria-label="Certified" />}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-card border border-line px-4 py-4">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="8 · Shares proposed">
            <span className="tabular">{app.sharesProposed}</span> · <Money value={d.shareAmount} />
          </Field>
          <Field label="Employee ID">{f.employment?.employeeId}</Field>
          <Field label="9 · Nominee">{f.nominee?.name ? `${f.nominee.name} (${f.nominee.relation ?? ''})` : ''}</Field>
          <Field label="Nominee address">{f.nominee?.address}</Field>
          <Field label="Permanent address" wide>
            {perm}
          </Field>
          <Field label="Email">{f.personal?.email}</Field>
          <Field label="Gender">{f.personal?.gender === 'F' ? 'Female' : f.personal?.gender === 'M' ? 'Male' : ''}</Field>
        </dl>
      </section>
    </div>
  );
}

function DocumentsTab({ d }: { d: MembershipDetail }) {
  const docs = d.application.form?.documents ?? [];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {d.requiredDocuments.map((req) => {
        const doc = docs.find((x) => x.type === req.type);
        const Icon = req.type === 'PHOTO' ? FileImage : FileText;
        return (
          <li key={req.type} className={cn('flex items-center gap-3 rounded-card border px-4 py-3', doc ? 'border-line' : req.required ? 'border-danger-border bg-danger-bg' : 'border-dashed border-line')}>
            <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-control', doc ? 'bg-brand-subtle text-brand-text' : 'bg-surface-muted text-fg-tertiary')}>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-label text-fg">{req.label}</p>
              <p className="truncate text-caption text-fg-tertiary">{doc ? `${doc.fileName} · ${formatDisplayDateTime(doc.uploadedAt)}` : req.required ? 'Missing (required)' : 'Not needed for regular employees'}</p>
            </div>
            {doc && <TagV2 text="Uploaded" size={TagV2Size.XS} color={TagV2Color.SUCCESS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
          </li>
        );
      })}
      <li className="text-caption text-fg-tertiary sm:col-span-2">Prototype: uploads are simulated, so there is no file preview.</li>
    </ul>
  );
}

function DeclarationsTab({ d }: { d: MembershipDetail }) {
  const app = d.application;
  const decl = app.form?.declarations ?? {};
  const accepted = { byelaws: decl.byelawsAccepted, noOtherSociety: decl.noOtherSociety, recoveryMandate: decl.recoveryMandateAccepted };
  return (
    <div className="flex flex-col gap-4">
      {app.signature && (
        <div className="flex items-start gap-3 rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-text" aria-hidden />
          <div>
            <p className="text-label text-fg">Signed with OTP by {app.form?.personal?.fullName ?? app.name}</p>
            <p className="text-caption text-fg-secondary">
              {formatDisplayDateTime(app.signature.signedAt)} · mobile {app.form?.personal?.mobile ?? '—'} · text version {app.signature.textVersion}
            </p>
          </div>
        </div>
      )}
      {d.agreements.map((a) => (
        <section key={a.key} className="rounded-card border border-line px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-label text-fg">{a.title}</h3>
            {accepted[a.key] ? (
              <span className="inline-flex items-center gap-1 text-caption-strong text-success-fg">
                <CircleCheck size={14} aria-hidden /> Accepted
              </span>
            ) : (
              <span className="text-caption text-fg-tertiary">Not accepted</span>
            )}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-caption text-fg-secondary">
            {a.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer text-caption text-link">Full text</summary>
            <p className="mt-2 text-caption text-fg-secondary">{a.text}</p>
          </details>
          {a.key === 'recoveryMandate' && app.ddoCertification?.mandateAgreed && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-caption-strong text-success-fg">
              <BadgeCheck size={14} aria-hidden /> AGREED by {app.ddoCertification.byName}, {app.ddoCertification.designation}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function ActivityTab({ d }: { d: MembershipDetail }) {
  const events = [...d.application.events].reverse();
  if (!events.length) return <p className="text-caption text-fg-tertiary">No activity yet.</p>;
  return (
    <Timeline>
      {events.map((e, i) => (
        <TimelineHeader key={`${e.at}-${i}`} title={EVENT_TITLE[e.action] ?? e.action} status={eventTone(e)} timestamp={formatDisplayDateTime(e.at)}>
          <TimelineSubstep title={`${e.actorName} · ${roleLabel(e.actorRole)}`} {...(e.remarks ? { description: e.remarks } : {})} />
        </TimelineHeader>
      ))}
    </Timeline>
  );
}

function SignOffs({ d }: { d: MembershipDetail }) {
  const a = d.application;
  const rows: Array<{ label: string; s?: { byName: string; at: string } }> = [
    { label: 'Intake', s: a.intake },
    { label: 'DDO certificate', s: a.ddoCertification },
    { label: 'Office review', s: a.officeReview },
    { label: 'Secretary', s: a.secretaryApproval },
    { label: 'President', s: a.presidentApproval },
    { label: 'Share payment', s: a.shareReceipt ? { byName: a.shareReceipt.byName, at: a.shareReceipt.at } : undefined },
  ];
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill', r.s ? 'bg-success-bg text-success-fg' : 'border border-line text-fg-tertiary')}>{r.s ? <CircleCheck size={14} aria-hidden /> : null}</span>
          <div className="min-w-0">
            <p className={cn('text-label', r.s ? 'text-fg' : 'text-fg-tertiary')}>{r.label}</p>
            {r.s && <p className="truncate text-caption text-fg-secondary">{`${r.s.byName} · ${formatDisplayDateTime(r.s.at)}`}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const ACTION_HINT: Record<MembershipAction, string> = {
  sendToDdo: 'Check the application is complete and send it to the department DDO.',
  certify: 'Verify items 1–7 with the service register and agree the salary recovery mandate.',
  forward: 'Review the DDO certificate and checks, then recommend to the Secretary.',
  approve: 'Approve or reject. The applicant sees each decision in the app.',
  recordSharePayment: 'Receipt the share capital to create the member and allot a General No.',
  activate: 'Activate now. Shares will be recovered on the first demand sheet.',
  returnToApplicant: '',
  reject: '',
};

export function JoiningDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState<MembershipAction | null>(null);
  const [tab, setTab] = useState('application');
  const q = useQuery({ queryKey: ['membership-application', id], queryFn: () => api.applications.get(id), refetchInterval: drawer ? false : 5000, retry: (n, e) => !(isApiError(e) && (e.status === 404 || e.status === 403)) && n < 2 });
  const demo = useMutation({
    mutationFn: () => api.applications.demoAct(id),
    onSuccess: (next) => {
      qc.setQueryData(['membership-application', id], next);
      void qc.invalidateQueries({ queryKey: ['membership-applications'] });
      addSnackbarV2({ header: 'Demo: stage completed', description: `Now: ${next.waitingOn ?? next.application.status}`, variant: SnackbarV2Variant.INFO });
    },
    onError: (e) => addSnackbarV2({ header: "Couldn't act", description: isApiError(e) ? e.message : 'Try again.', variant: SnackbarV2Variant.ERROR }),
  });

  const d = q.data;
  const notFound = isApiError(q.error) && (q.error.status === 404 || q.error.status === 403);
  const app = d?.application;
  const daysInStage = app ? Math.max(0, Math.round((Date.now() - Date.parse(app.events.at(-1)?.at ?? app.submittedOn ?? '')) / 86_400_000)) : 0;
  const checksFailing = d ? d.checks.filter((c) => !c.pass).length : 0;

  return (
    <>
      <ButtonV2 text="Joining" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/joining')} />

      <ViewState
        state={q.isLoading ? 'loading' : notFound ? 'empty' : q.isError ? 'error' : 'ready'}
        layout="detail"
        onRetry={() => void q.refetch()}
        empty={{ icon: UserX, title: 'Application not found', description: 'It may be outside your department, or the demo data was reset.', action: { label: 'Back to Joining', onClick: () => navigate('/joining') } }}
      >
        {d && app && (
          <div className="mt-3 flex flex-col gap-5">
            {/* Header */}
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Initials name={app.name} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-page-title text-fg">{app.name}</h1>
                    <StatusTag entity="membership" status={app.status} size={TagV2Size.MD} />
                  </div>
                  <p className="mt-1 text-body text-fg-secondary">
                    <span className="tabular">{app.applicationNo}</span> · {app.designation} · {d.department?.name}
                    {app.submittedOn ? ` · submitted ${formatDisplayDate(app.submittedOn)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {app.status !== 'DRAFT' && <ButtonV2 text="Print form" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Printer size={16} /> }} onClick={() => navigate(`/reports/print/membership?application=${app.id}`)} />}
                {d.actions.filter((a) => !isPrimaryAction(a)).map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a]} buttonType={ButtonV2Type.SECONDARY} onClick={() => setDrawer(a)} />
                ))}
                {d.actions.filter(isPrimaryAction).map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a]} buttonType={ButtonV2Type.PRIMARY} onClick={() => setDrawer(a)} />
                ))}
                {!d.actions.length && d.demoActAs && (
                  <TooltipV2 content="Demo control: completes this stage as the person who owns it, so you can follow the flow without switching logins.">
                    <span>
                      <ButtonV2 text={`Act as ${d.demoActAs.name}`} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FlaskConical size={16} /> }} loading={demo.isPending} onClick={() => demo.mutate()} />
                    </span>
                  </TooltipV2>
                )}
              </div>
            </header>

            {app.status === 'INFO_REQUESTED' && app.infoRequest && (
              <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading={`Returned to the applicant by ${app.infoRequest.by === 'DDO' ? 'the DDO' : 'the office'}`} description={app.infoRequest.message} />
            )}
            {app.status === 'REJECTED' && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading={`Rejected${app.rejection ? ` by ${app.rejection.byName}` : ''}`} description={app.rejection?.remarks ?? 'No reason recorded.'} />}
            {app.status === 'ACTIVE' && (
              <AlertV2
                type={AlertV2Type.SUCCESS}
                subType={AlertV2SubType.SUBTLE}
                heading={`Member · General No. ${app.allottedGeneralNo ?? ''}`}
                description={app.shareReceipt ? (app.shareReceipt.mode === 'FIRST_DEMAND' ? 'Shares will be recovered on the first demand sheet.' : `Shares paid · receipt ${app.shareReceipt.receiptNo} (${({ CASH: 'cash', UPI: 'UPI', CHEQUE: 'cheque' } as Record<string, string>)[app.shareReceipt.mode] ?? app.shareReceipt.mode})`) : 'Member record created.'}
              />
            )}

            <div className="rounded-card border border-line bg-surface px-5 py-4 shadow-raised">
              <StepperV2 steps={steps(d)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="min-w-0 rounded-card border border-line bg-surface px-5 pb-5 pt-2 shadow-raised xl:col-span-2">
                <TabsV2 value={tab} onValueChange={setTab}>
                  <TabsV2List variant={TabsV2Variant.UNDERLINE}>
                    <TabsV2Trigger value="application" variant={TabsV2Variant.UNDERLINE}>
                      Application
                    </TabsV2Trigger>
                    <TabsV2Trigger value="documents" variant={TabsV2Variant.UNDERLINE}>
                      Documents
                    </TabsV2Trigger>
                    <TabsV2Trigger value="declarations" variant={TabsV2Variant.UNDERLINE}>
                      Declarations
                    </TabsV2Trigger>
                    <TabsV2Trigger value="checks" variant={TabsV2Variant.UNDERLINE} rightSlot={checksFailing ? <span className="tabular rounded-pill bg-warning-bg px-1.5 text-caption-strong text-warning-fg">{checksFailing}</span> : undefined}>
                      Checks
                    </TabsV2Trigger>
                    <TabsV2Trigger value="activity" variant={TabsV2Variant.UNDERLINE}>
                      Activity
                    </TabsV2Trigger>
                  </TabsV2List>
                  <div className="pt-5">
                    <TabsV2Content value="application">
                      <ApplicationTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="documents">
                      <DocumentsTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="declarations">
                      <DeclarationsTab d={d} />
                    </TabsV2Content>
                    <TabsV2Content value="checks">
                      <RuleCheckList checks={d.checks} />
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
                      <p className="text-body text-fg-secondary">{ACTION_HINT[d.actions[0] as MembershipAction]}</p>
                      <ButtonV2 text={ACTION_LABEL[d.actions.find(isPrimaryAction) ?? (d.actions[0] as MembershipAction)]} buttonType={ButtonV2Type.PRIMARY} width="100%" onClick={() => setDrawer(d.actions.find(isPrimaryAction) ?? (d.actions[0] as MembershipAction))} />
                    </div>
                  ) : d.waitingOn ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-label text-fg">Waiting on {d.waitingOn}</p>
                      <p className="inline-flex items-center gap-1.5 text-caption text-fg-tertiary">
                        <Clock size={14} aria-hidden /> In this stage for {daysInStage === 0 ? 'less than a day' : `${daysInStage} day${daysInStage === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-body text-fg-secondary">{app.status === 'ACTIVE' ? 'Done. The applicant is now a member and sees their General No. in the app.' : 'No further steps.'}</p>
                  )}
                </Panel>
                <Panel title="Sign-offs" subtitle="Recorded with name and time">
                  <SignOffs d={d} />
                </Panel>
              </div>
            </div>

            <ActionDrawer detail={d} action={drawer} onClose={() => setDrawer(null)} />
          </div>
        )}
      </ViewState>
    </>
  );
}
