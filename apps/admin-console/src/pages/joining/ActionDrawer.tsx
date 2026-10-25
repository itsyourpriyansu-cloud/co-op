// ST-16 (DDO certify), ST-17 (Secretary → President approval) and the other joining actions,
// in one side drawer. The server re-validates everything; this only guides the user.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, Clock, PenLine } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Type,
  Checkbox,
  CheckboxSize,
  Radio,
  RadioGroup,
  SnackbarV2Variant,
  TextAreaV2,
  TextInputV2,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatDisplayDateTime } from '@tgs/domain';
import { F1_CERT_ITEMS, type F1CertItem, type MembershipAction, type MembershipActionInput, type MembershipDetail } from '@tgs/types';
import { Money } from '@/components/Money';
import { RuleCheckList } from '@/components/RuleCheckList';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ACTION_LABEL, certItems, RETURN_FIELDS } from './joining';

const ITEM_FIELD: Record<F1CertItem, string> = {
  name: 'personal.fullName',
  fatherName: 'personal.fatherName',
  dob: 'personal.dob',
  address: 'address.present.line1',
  designation: 'employment.designation',
  office: 'employment.departmentId',
  appointment: 'employment.regularAppointmentDate',
};

const TITLES: Record<MembershipAction, (d: MembershipDetail) => { title: string; description: string }> = {
  sendToDdo: (d) => ({ title: 'Intake check', description: `Confirm the application is complete, then send it to the ${d.department?.name ?? ''} DDO for certification.` }),
  certify: () => ({ title: 'Certify items 1 to 7', description: 'Check each item against the service register. Certifying adds your digital seal to the form.' }),
  forward: () => ({ title: 'Office review', description: 'Recommend the application to the Secretary. Your remarks travel with it.' }),
  approve: (d) =>
    d.application.status === 'APPROVAL_PRESIDENT'
      ? { title: 'Approve membership (2 of 2)', description: 'Final approval. Choose how the new member pays for the shares.' }
      : { title: 'Approve membership (1 of 2)', description: 'Your approval sends the application to the President.' },
  recordSharePayment: () => ({ title: 'Record share payment', description: 'Receipt the share capital. The member record and General No. are created right away.' }),
  activate: () => ({ title: 'Activate membership', description: 'Shares will be recovered on the first demand sheet. The member record and General No. are created now.' }),
  returnToApplicant: () => ({ title: 'Return to applicant', description: 'The applicant sees your message in the app, corrects the form and signs again.' }),
  reject: () => ({ title: 'Reject application', description: 'This ends the application. The applicant sees your reason in the app.' }),
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">{title}</h3>
      {children}
    </section>
  );
}

function SignOffRow({ n, role, name, at, remarks }: { n: number; role: string; name?: string; at?: string; remarks?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill text-caption-strong', name ? 'bg-success-bg text-success-fg' : 'bg-surface-muted text-fg-tertiary')}>{name ? <Check size={14} aria-hidden /> : n}</span>
      <div className="min-w-0">
        <p className="text-label text-fg">{role}</p>
        <p className="text-caption text-fg-secondary">{name ? `${name} · ${at ? formatDisplayDateTime(at) : ''}` : 'Pending'}</p>
        {remarks && <p className="mt-0.5 text-caption text-fg-tertiary">“{remarks}”</p>}
      </div>
    </li>
  );
}

export function ActionDrawer({ detail, action, onClose }: { detail: MembershipDetail; action: MembershipAction | null; onClose: () => void }) {
  const qc = useQueryClient();
  const app = detail.application;
  const [remarks, setRemarks] = useState('');
  const [field, setField] = useState('');
  const [items, setItems] = useState<Partial<Record<F1CertItem, 'OK' | 'FLAG'>>>({});
  const [mandate, setMandate] = useState(false);
  const [route, setRoute] = useState<'COUNTER' | 'FIRST_DEMAND' | ''>('');
  const [mode, setMode] = useState<'CASH' | 'UPI' | 'CHEQUE'>('CASH');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Fresh form each time the drawer opens; sensible defaults per action.
  useEffect(() => {
    if (!action) return;
    setRemarks(action === 'forward' ? 'Eligible. Recommended for admission.' : action === 'sendToDdo' ? 'Documents complete. Sent to the department for certification.' : '');
    setField(app.infoRequest?.field ?? '');
    setItems({});
    setMandate(false);
    setRoute('');
    setMode('CASH');
    setReference('');
    setErrors({});
    setError(null);
  }, [action, app.id, app.infoRequest?.field]);

  const flagged = F1_CERT_ITEMS.filter((i) => items[i] === 'FLAG');
  const allConfirmed = F1_CERT_ITEMS.every((i) => items[i] === 'OK');
  const rows = useMemo(() => certItems(app, detail.department?.name ?? ''), [app, detail.department]);

  const mutation = useMutation({
    mutationFn: ({ a, input }: { a: MembershipAction; input: MembershipActionInput }) => api.applications.act(app.id, a, input),
    onSuccess: (next, { a }) => {
      qc.setQueryData(['membership-application', app.id], next);
      void qc.invalidateQueries({ queryKey: ['membership-applications'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      const n = next.application;
      const message: Record<MembershipAction, string> = {
        sendToDdo: `Sent to ${next.waitingOn ?? 'the DDO'}`,
        certify: 'Certified. Sent to the office for review',
        forward: 'Recommended to the Secretary',
        approve: n.status === 'SHARE_PAYMENT_PENDING' ? 'Approved. Waiting for share payment' : 'Approved. Sent to the President',
        recordSharePayment: `Membership activated · General No. ${n.allottedGeneralNo ?? ''}`,
        activate: `Membership activated · General No. ${n.allottedGeneralNo ?? ''}`,
        returnToApplicant: 'Returned to the applicant',
        reject: 'Application rejected',
      };
      addSnackbarV2({ header: message[a], description: `${n.name} · ${n.applicationNo}`, variant: a === 'reject' ? SnackbarV2Variant.WARNING : SnackbarV2Variant.SUCCESS });
      onClose();
    },
    onError: (e) => {
      if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      setError(isApiError(e) ? e.message : 'Something went wrong. Nothing was saved.');
    },
  });

  if (!action) return null;
  const { title, description } = TITLES[action](detail);

  const submit = () => {
    setError(null);
    setErrors({});
    if (action === 'certify' && flagged.length) {
      // Flagged items turn certification into a return with the items listed.
      const names = rows.filter((r) => flagged.includes(r.key)).map((r) => r.label.toLowerCase());
      mutation.mutate({ a: 'returnToApplicant', input: { field: ITEM_FIELD[flagged[0] as F1CertItem], remarks: `Please correct: ${names.join(', ')}.${remarks.trim() ? ` ${remarks.trim()}` : ''}` } });
      return;
    }
    const input: MembershipActionInput = { ...(remarks.trim() ? { remarks: remarks.trim() } : {}) };
    if (action === 'certify') Object.assign(input, { items, mandateAgreed: mandate });
    if (action === 'returnToApplicant' && field) input.field = field;
    if (action === 'approve' && app.status === 'APPROVAL_PRESIDENT' && route) input.sharePaymentRoute = route;
    if (action === 'recordSharePayment') Object.assign(input, { mode, ...(reference.trim() ? { reference: reference.trim() } : {}) });
    mutation.mutate({ a: action, input });
  };

  const primaryText =
    action === 'certify' && flagged.length
      ? `Return with ${flagged.length} item${flagged.length === 1 ? '' : 's'} to correct`
      : action === 'sendToDdo'
        ? `Send to ${detail.department?.ddoName ?? 'the DDO'}`
        : action === 'recordSharePayment'
          ? 'Record payment & allot General No.'
          : action === 'activate'
            ? 'Activate & allot General No.'
            : action === 'returnToApplicant'
              ? 'Send back to applicant'
              : ACTION_LABEL[action];
  const disabled =
    mutation.isPending ||
    (action === 'certify' && !flagged.length && (!allConfirmed || !mandate)) ||
    (action === 'approve' && app.status === 'APPROVAL_PRESIDENT' && !route) ||
    ((action === 'returnToApplicant' || action === 'reject') && remarks.trim().length < 10);

  return (
    <SideDrawer
      open={Boolean(action)}
      onClose={onClose}
      title={title}
      description={description}
      footer={
            <div className="flex w-full items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                <Clock size={14} aria-hidden /> Recorded with your name and time
              </span>
              <div className="flex gap-2">
                <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} />
                <ButtonV2 text={primaryText} buttonType={action === 'reject' ? ButtonV2Type.DANGER : ButtonV2Type.PRIMARY} loading={mutation.isPending} disabled={disabled} onClick={submit} />
              </div>
            </div>
      }
    >
            <div className="flex flex-col gap-6 pb-4">
              <div className="rounded-card border border-line bg-surface-subtle px-4 py-3">
                <p className="text-label text-fg">{app.name}</p>
                <p className="text-caption text-fg-secondary">
                  <span className="tabular">{app.applicationNo}</span> · {app.designation} · {detail.department?.name}
                </p>
              </div>

              {action === 'certify' && (
                <>
                  <Section title="Items 1 to 7 (form F1)">
                    <ul className="flex flex-col divide-y divide-line-subtle rounded-card border border-line">
                      {rows.map((r) => (
                        <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="tabular w-5 shrink-0 text-caption-strong text-fg-tertiary">{r.no}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-caption text-fg-tertiary">{r.label}</p>
                            <p className="truncate text-label text-fg" title={r.value}>
                              {r.value}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`Item ${r.no}: ${r.label}`}>
                            {(['OK', 'FLAG'] as const).map((v) => (
                              <button
                                key={v}
                                type="button"
                                role="radio"
                                aria-checked={items[r.key] === v}
                                onClick={() => setItems((s) => ({ ...s, [r.key]: v }))}
                                className={cn(
                                  'inline-flex h-8 items-center gap-1 rounded-control border px-2.5 text-caption-strong transition-colors',
                                  items[r.key] === v
                                    ? v === 'OK'
                                      ? 'border-success-border bg-success-bg text-success-fg'
                                      : 'border-warning-border bg-warning-bg text-warning-fg'
                                    : 'border-line bg-surface text-fg-secondary hover:bg-surface-subtle',
                                )}
                              >
                                {v === 'OK' ? <Check size={14} aria-hidden /> : <PenLine size={14} aria-hidden />}
                                {v === 'OK' ? 'Correct' : 'Fix'}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="self-start text-caption text-link hover:underline" onClick={() => setItems(Object.fromEntries(F1_CERT_ITEMS.map((i) => [i, 'OK'])))}>
                      Mark all as correct
                    </button>
                  </Section>
                  {flagged.length > 0 ? (
                    <TextAreaV2 label="Note for the applicant (optional)" placeholder="e.g. Your service register shows 01 Jul 2021." value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} />
                  ) : (
                    <Section title="Salary recovery mandate (form F6)">
                      <ul className="list-disc space-y-1 pl-5 text-body text-fg-secondary">
                        {(detail.agreements.find((a) => a.key === 'recoveryMandate')?.summary ?? []).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                      <Checkbox checked={mandate} onCheckedChange={(v) => setMandate(v === true)} size={CheckboxSize.MEDIUM} subtext={`As ${detail.department?.ddoDesignation ?? 'DDO'}, ${detail.department?.name ?? ''}`} error={Boolean(errors.mandateAgreed)}>
                        AGREED: deduct society dues from this employee's salary
                      </Checkbox>
                    </Section>
                  )}
                </>
              )}

              {(action === 'sendToDdo' || action === 'forward') && (
                <Section title="Checks">
                  <RuleCheckList checks={detail.checks} />
                </Section>
              )}

              {action === 'forward' && app.ddoCertification && (
                <div className="flex items-start gap-2 rounded-card border border-success-border bg-success-bg px-3 py-2.5 text-caption text-success-fg">
                  <CircleCheck size={16} className="mt-px shrink-0" aria-hidden />
                  Items 1–7 certified and recovery mandate agreed by {app.ddoCertification.byName}, {app.ddoCertification.designation} · {formatDisplayDateTime(app.ddoCertification.at)}
                </div>
              )}

              {action === 'approve' && (
                <>
                  <Section title="Summary">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <dt className="text-caption text-fg-tertiary">Shares proposed</dt>
                        <dd className="tabular text-label text-fg">{app.sharesProposed}</dd>
                      </div>
                      <div>
                        <dt className="text-caption text-fg-tertiary">Share capital</dt>
                        <dd className="text-label text-fg">
                          <Money value={detail.shareAmount} />
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-caption text-fg-tertiary">DDO certificate</dt>
                        <dd className="text-body text-fg">{app.ddoCertification ? `${app.ddoCertification.byName}, ${app.ddoCertification.designation} · mandate agreed` : 'Not certified'}</dd>
                      </div>
                      {app.officeReview?.remarks && (
                        <div className="col-span-2">
                          <dt className="text-caption text-fg-tertiary">Office remarks</dt>
                          <dd className="text-body text-fg">“{app.officeReview.remarks}”</dd>
                        </div>
                      )}
                    </dl>
                  </Section>
                  <Section title="Sign-off">
                    <ol className="flex flex-col gap-3">
                      <SignOffRow n={1} role="Secretary" name={app.secretaryApproval?.byName} at={app.secretaryApproval?.at} remarks={app.secretaryApproval?.remarks} />
                      <SignOffRow n={2} role="President" name={app.presidentApproval?.byName} at={app.presidentApproval?.at} />
                    </ol>
                  </Section>
                  {app.status === 'APPROVAL_PRESIDENT' && (
                    <Section title="Share payment (D-029)">
                      <RadioGroup name="route" value={route} onChange={(v) => setRoute(v as 'COUNTER' | 'FIRST_DEMAND')} error={Boolean(errors.sharePaymentRoute)}>
                        <Radio value="COUNTER" subtext="The new member pays the cashier now. Membership starts on receipt.">
                          At the counter
                        </Radio>
                        <Radio value="FIRST_DEMAND" subtext="Membership starts now. Shares are added to the first salary demand.">
                          On the first demand sheet
                        </Radio>
                      </RadioGroup>
                    </Section>
                  )}
                </>
              )}

              {(action === 'recordSharePayment' || action === 'activate') && (
                <Section title="Share capital">
                  <div className="rounded-card border border-line px-4 py-3">
                    <Money value={detail.shareAmount} className="text-metric text-fg" />
                    <p className="mt-1 text-caption text-fg-tertiary">
                      {app.sharesProposed} shares · {amountInWords(detail.shareAmount)}
                    </p>
                  </div>
                  {action === 'recordSharePayment' && (
                    <>
                      <RadioGroup name="mode" label="Received as" value={mode} onChange={(v) => setMode(v as 'CASH' | 'UPI' | 'CHEQUE')}>
                        <Radio value="CASH">Cash</Radio>
                        <Radio value="UPI">UPI</Radio>
                        <Radio value="CHEQUE">Cheque</Radio>
                      </RadioGroup>
                      {mode !== 'CASH' && (
                        <TextInputV2 label={mode === 'UPI' ? 'UPI reference' : 'Cheque number'} placeholder={mode === 'UPI' ? 'e.g. 4302 1187 6650' : 'e.g. 004512'} value={reference} onChange={(e) => setReference(e.target.value)} required error={errors.reference ? { show: true, message: errors.reference } : undefined} />
                      )}
                    </>
                  )}
                </Section>
              )}

              {action === 'returnToApplicant' && (
                <Section title="What needs correcting (optional)">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="What needs correcting">
                    {RETURN_FIELDS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        aria-pressed={field === f.value}
                        onClick={() => setField(field === f.value ? '' : f.value)}
                        className={cn(
                          'rounded-pill border px-3 py-1.5 text-caption-strong transition-colors',
                          field === f.value ? 'border-brand-border bg-brand-subtle text-brand-text' : 'border-line bg-surface text-fg-secondary hover:bg-surface-subtle',
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {action !== 'certify' && (
                <TextAreaV2
                  label={action === 'reject' ? 'Reason' : action === 'returnToApplicant' ? 'Message to the applicant' : 'Remarks'}
                  placeholder={action === 'reject' ? 'e.g. Applicant is a member of another credit society with dues.' : action === 'returnToApplicant' ? 'e.g. Upload a clear copy of the appointment order.' : 'Optional'}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  required={action === 'reject' || action === 'returnToApplicant'}
                  hintText={action === 'reject' || action === 'returnToApplicant' ? 'The applicant sees this in the app. At least 10 characters.' : undefined}
                  error={errors.remarks ? { show: true, message: errors.remarks } : undefined}
                />
              )}

              {error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't save" description={error} />}
            </div>
    </SideDrawer>
  );
}
