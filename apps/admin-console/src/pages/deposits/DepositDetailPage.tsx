// ST-32 Deposit detail + ST-33 payment & acceptance drawer. FD requests show the stepper
// (Requested → Payment → Secretary → President); accepted FDs show maturity, payouts, holders, the
// receipt with denominations and the FDR. CRD / SRDS / Savings show the ledger.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileSearch, FileText, FlaskConical } from 'lucide-react';
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
  SnackbarV2Variant,
  StepperV2,
  StepperV2StepStatus,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  TextAreaV2,
  TextInputV2,
  TooltipV2,
  addSnackbarV2,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR, minorMajorityDate } from '@tgs/domain';
import type { DepositActionInput, DepositDetail } from '@tgs/types';
import { DenominationCounter, type Counts } from '@/components/DenominationCounter';
import { TextField } from '@/components/Form';
import { Money } from '@/components/Money';
import { Panel } from '@/components/Panel';
import { SideDrawer } from '@/components/SideDrawer';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ACTION_LABEL: Record<string, string> = { recordPayment: 'Record payment', accept: 'Accept', reject: 'Reject', cancel: 'Cancel request', refund: 'Refund', payout: 'Pay out' };
const SCHEME: Record<string, string> = { FD: 'Fixed deposit', CRD: 'CRD', SRDS: 'SRDS', SAVINGS: 'Savings' };
const PAYOUT: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', ON_MATURITY: 'On maturity' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body text-fg">{children || '—'}</dd>
    </div>
  );
}

function ActionDrawer({ d, action, onClose, today }: { d: DepositDetail; action: string | null; onClose: () => void; today: string }) {
  const qc = useQueryClient();
  const dep = d.deposit;
  const [mode, setMode] = useState<'CASH' | 'TRANSFER' | 'CHEQUE'>('CASH');
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  useEffect(() => {
    if (!action) return;
    setMode('CASH');
    setCounts({});
    setReference('');
    setDate(today);
    setRemarks('');
  }, [action, today]);
  const m = useMutation({
    mutationFn: (input: DepositActionInput) => api.deposits.act(dep.id, action!, input),
    onSuccess: (next) => {
      qc.setQueryData(['deposit', dep.id], next);
      void qc.invalidateQueries({ queryKey: ['deposits'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      addSnackbarV2({ header: next.deposit.status === 'ACTIVE' ? `FD active · ${next.deposit.fdrNo}` : `${ACTION_LABEL[action!]} · done`, description: next.waitingOn ? `Now with ${next.waitingOn}` : undefined, variant: action === 'reject' ? SnackbarV2Variant.WARNING : SnackbarV2Variant.SUCCESS });
      onClose();
    },
  });
  if (!action) return null;
  const fe = isApiError(m.error) ? (m.error.fieldErrors ?? {}) : {};
  const total = Object.entries(counts).reduce((s, [k, v]) => s + Number(k) * 100 * (v ?? 0), 0);
  const needsReason = action === 'reject';
  const ready = action === 'recordPayment' ? (mode === 'CASH' ? total === dep.principal : Boolean(reference.trim())) && Boolean(date) : needsReason ? Boolean(remarks.trim()) : true;
  const input = (): DepositActionInput => ({
    ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
    ...(action === 'recordPayment' ? { payment: { mode, date, ...(mode === 'CASH' ? { denominations: counts } : { reference: reference.trim() }) } } : {}),
  });
  const title = action === 'recordPayment' ? 'Receive payment (cash slip)' : action === 'accept' ? (dep.status === 'ACCEPTANCE_PRESIDENT' ? 'Accept deposit (2 of 2)' : 'Accept deposit (1 of 2)') : (ACTION_LABEL[action] ?? action);
  return (
    <SideDrawer
      open
      onClose={onClose}
      title={title}
      description={`${d.member.name} · No. ${d.member.generalNo} · ${dep.accountNo}`}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} disabled={m.isPending} />
          <ButtonV2 text={ACTION_LABEL[action] ?? action} buttonType={action === 'reject' ? ButtonV2Type.DANGER : ButtonV2Type.PRIMARY} disabled={!ready} loading={m.isPending} onClick={() => m.mutate(input())} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {m.isError && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(m.error) ? m.error.message : 'Try again.'} />}
        <div className="rounded-card bg-surface-subtle px-4 py-3">
          <p className="text-label text-fg">
            <Money value={dep.principal ?? 0} /> for {dep.tenureMonths} months at {dep.ratePercent}%
          </p>
          <p className="text-caption text-fg-secondary">{amountInWords(dep.principal ?? 0)}</p>
        </div>
        {action === 'recordPayment' && (
          <>
            <div role="radiogroup" aria-label="Mode" className="flex flex-wrap gap-2">
              {(['CASH', 'TRANSFER', 'CHEQUE'] as const).map((x) => (
                <button key={x} type="button" role="radio" aria-checked={mode === x} onClick={() => setMode(x)} className={cn('rounded-pill border px-3 py-1.5 text-label', mode === x ? 'border-brand-solid bg-brand-subtle text-brand-text' : 'border-line text-fg-secondary hover:bg-surface-subtle')}>
                  {x === 'CASH' ? 'Cash' : x === 'TRANSFER' ? 'Bank transfer' : 'Cheque'}
                </button>
              ))}
            </div>
            {mode === 'CASH' ? <DenominationCounter amount={dep.principal ?? 0} counts={counts} onChange={setCounts} /> : <TextField label={mode === 'CHEQUE' ? 'Cheque number' : 'UTR / reference'} name="reference" value={reference} onChange={setReference} errors={fe} />}
            {fe.denominations && <p className="text-caption text-danger-fg">{fe.denominations}</p>}
            <TextInputV2 label="Date received" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={fe.date ? { show: true, message: fe.date } : undefined} hintText="Interest runs from this date" />
          </>
        )}
        {action === 'accept' && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-line px-4 py-3">
            <Field label="Payment">{dep.payment ? `${dep.payment.mode.toLowerCase()} · ${dep.payment.receiptNo}` : '—'}</Field>
            <Field label="Received on">{dep.payment ? formatDisplayDate(dep.payment.date) : '—'}</Field>
            <Field label="Matures">{d.maturity ? formatDisplayDate(d.maturity.date) : '—'}</Field>
            <Field label="Maturity value">{d.maturity ? <Money value={d.maturity.value} /> : '—'}</Field>
            <Field label="Secretary">{dep.signOffs?.secretary ? `${dep.signOffs.secretary.byName} · ${formatDisplayDateTime(dep.signOffs.secretary.at)}` : 'Pending'}</Field>
            <Field label="President">{dep.status === 'ACCEPTANCE_PRESIDENT' ? 'Your signature issues the FDR' : 'Next'}</Field>
          </dl>
        )}
        <TextAreaV2 label={needsReason ? 'Reason (the member sees this)' : 'Remarks'} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder={needsReason ? 'e.g. KYC does not match' : 'Optional'} required={needsReason} />
      </div>
    </SideDrawer>
  );
}

export function DepositDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [drawer, setDrawer] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id), refetchInterval: drawer ? false : 5000, retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const demoState = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state });
  const demo = useMutation({
    mutationFn: () => api.deposits.demoAct(id),
    onSuccess: (next) => {
      qc.setQueryData(['deposit', id], next);
      void qc.invalidateQueries({ queryKey: ['deposits'] });
      addSnackbarV2({ header: 'Demo: stage completed', description: next.waitingOn ? `Now with ${next.waitingOn}` : next.deposit.status, variant: SnackbarV2Variant.INFO });
    },
    onError: (e) => addSnackbarV2({ header: "Couldn't act", description: isApiError(e) ? e.message : 'Try again.', variant: SnackbarV2Variant.ERROR }),
  });
  const d = q.data;
  const dep = d?.deposit;
  const notFound = isApiError(q.error) && q.error.status === 404;
  const isFd = dep?.scheme === 'FD';
  const primary = d?.actions.filter((a) => a !== 'reject' && a !== 'cancel') ?? [];
  const secondary = d?.actions.filter((a) => a === 'reject' || a === 'cancel') ?? [];

  return (
    <>
      <ButtonV2 text="Deposits" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/deposits')} />
      <ViewState
        state={q.isLoading ? 'loading' : notFound ? 'empty' : q.isError ? 'error' : 'ready'}
        layout="detail"
        onRetry={() => void q.refetch()}
        empty={{ icon: FileSearch, title: 'Deposit not found', action: { label: 'Back to Deposits', onClick: () => navigate('/deposits') } }}
      >
        {d && dep && (
          <div className="mt-3 flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <AvatarV2 fallbackText={d.member.name} size={AvatarV2Size.LG} alt={d.member.name} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-page-title text-fg">
                      {SCHEME[dep.scheme]} · <Money value={isFd ? (dep.principal ?? 0) : dep.balance} />
                    </h1>
                    <StatusTag entity="deposit" status={dep.status} size={TagV2Size.MD} />
                    {dep.pledgedToLoanId && <TagV2 text="Pledged" size={TagV2Size.SM} color={TagV2Color.PURPLE} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
                  </div>
                  <p className="mt-1 text-body text-fg-secondary">
                    <span className="tabular">{dep.fdrNo ?? dep.accountNo}</span> ·{' '}
                    <Link to={`/members/${d.member.id}`} className="text-link hover:underline">
                      {d.member.name} (No. {d.member.generalNo})
                    </Link>{' '}
                    · {d.member.departmentName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dep.fdrNo && <ButtonV2 text="FDR" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FileText size={16} /> }} onClick={() => navigate(`/deposits/${dep.id}/fdr`)} />}
                {secondary.map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.SECONDARY} onClick={() => setDrawer(a)} />
                ))}
                {primary.map((a) => (
                  <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.PRIMARY} onClick={() => setDrawer(a)} />
                ))}
                {d.demoActAs && (
                  <TooltipV2 content="Demo control: completes this stage as its owner (cash counted exactly, acceptances signed).">
                    <span>
                      <ButtonV2 text={`Act as ${d.demoActAs}`} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FlaskConical size={16} /> }} loading={demo.isPending} onClick={() => demo.mutate()} />
                    </span>
                  </TooltipV2>
                )}
              </div>
            </header>

            {dep.status === 'REFUND_PENDING' && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading={`Not accepted by ${dep.rejection?.byName ?? ''}`} description={`${dep.rejection?.remarks ?? ''} The Cashier refunds the money.`} />}
            {dep.status === 'CANCELLED' && <AlertV2 type={AlertV2Type.NEUTRAL} subType={AlertV2SubType.SUBTLE} heading="Cancelled" description={dep.cancelledReason ?? ''} />}

            {isFd && d.stages.length > 0 && !['ACTIVE', 'MATURED', 'CLOSED'].includes(dep.status) && (
              <div className="overflow-x-auto rounded-card border border-line bg-surface px-5 py-4 shadow-raised">
                <StepperV2 steps={d.stages.map((s, i) => ({ id: i + 1, title: s.title, status: s.status === 'done' ? StepperV2StepStatus.COMPLETED : s.status === 'current' ? StepperV2StepStatus.CURRENT : StepperV2StepStatus.PENDING }))} />
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
                {isFd ? (
                  <Panel title="Deposit (form F4)">
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                      <Field label="5 · Amount">
                        <Money value={dep.principal ?? 0} />
                      </Field>
                      <Field label="6 · Period">{`${dep.tenureMonths} months`}</Field>
                      <Field label="7 · Rate">{`${dep.ratePercent}% a year`}</Field>
                      <Field label="8 · Interest paid">{PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY']}</Field>
                      <Field label="Matures on">{d.maturity ? formatDisplayDate(d.maturity.date) : '—'}</Field>
                      <Field label="Maturity value">{d.maturity ? <Money value={d.maturity.value} /> : '—'}</Field>
                      <Field label="9 · Nominee">{dep.nominee ? `${dep.nominee.name} (${dep.nominee.relation})` : '—'}</Field>
                      <Field label="Holders">{dep.operationMode === 'SINGLE' ? 'Single' : `${dep.operationMode === 'EITHER_OR_SURVIVOR' ? 'Either or survivor' : 'Any one or survivor'}: ${[d.member.name, ...dep.jointHolders].join(', ')}`}</Field>
                      <Field label="Entered">{dep.channel === 'APP' ? `In the app${dep.signature ? ` · signed with OTP ${formatDisplayDateTime(dep.signature.signedAt)}` : ''}` : dep.channel === 'COUNTER' ? 'At the counter (paper F4)' : '—'}</Field>
                    </dl>
                    {dep.minor && (
                      <p className="mt-4 rounded-control bg-surface-subtle px-3 py-2 text-caption text-fg-secondary">
                        For a minor: {dep.minor.name}, born {formatDisplayDate(dep.minor.dob)}, comes of age {formatDisplayDate(minorMajorityDate(dep.minor.dob))}. Guardian {dep.minor.guardianName}
                        {dep.minor.guardianRelation ? ` (${dep.minor.guardianRelation})` : ''}.
                      </p>
                    )}
                    {dep.holders?.length ? (
                      <ul className="mt-4 flex flex-col gap-2">
                        {dep.holders.map((h) => (
                          <li key={h.name} className="rounded-control border border-line px-3 py-2 text-caption text-fg-secondary">
                            <span className="text-label text-fg">{h.name}</span> · s/o / w/o {h.fatherOrHusbandName} · {h.occupation} · {h.address} · {h.phone}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Panel>
                ) : null}

                {d.payouts.length > 0 && (
                  <Panel title="Interest payouts" subtitle={`${PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY']}${d.maturity ? ` · ${formatINR(d.maturity.totalInterest)} over the term` : ''}`} flush>
                    <ul className="max-h-72 divide-y divide-line-subtle overflow-y-auto">
                      {d.payouts.map((p) => (
                        <li key={p.date} className="flex items-center justify-between px-5 py-2 text-body">
                          <span>{formatDisplayDate(p.date)}</span>
                          <span className="flex items-center gap-3">
                            <Money value={p.amount} />
                            <TagV2 text={p.paid ? 'Paid' : 'Due'} size={TagV2Size.XS} color={p.paid ? TagV2Color.SUCCESS : TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}

                <Panel title="Ledger" flush>
                  {d.ledger.length ? (
                    <table className="w-full text-left text-body">
                      <thead className="bg-surface-subtle text-caption text-fg-tertiary">
                        <tr>
                          <th className="px-5 py-2 font-medium">Date</th>
                          <th className="px-5 py-2 font-medium">Particulars</th>
                          <th className="px-5 py-2 text-right font-medium">Credit</th>
                          <th className="px-5 py-2 text-right font-medium">Debit</th>
                          <th className="px-5 py-2 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {d.ledger.map((r, i) => (
                          <tr key={i}>
                            <td className="whitespace-nowrap px-5 py-1.5">{formatDisplayDate(r.date)}</td>
                            <td className="px-5 py-1.5 text-fg-secondary">{r.particulars}</td>
                            <td className="px-5 py-1.5 text-right">{r.credit ? <Money value={r.credit} /> : ''}</td>
                            <td className="px-5 py-1.5 text-right">{r.debit ? <Money value={r.debit} /> : ''}</td>
                            <td className="px-5 py-1.5 text-right">
                              <Money value={r.balance} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="px-5 py-4 text-caption text-fg-tertiary">Nothing received yet.</p>
                  )}
                </Panel>
              </div>

              <div className="flex flex-col gap-5 xl:self-start">
                <Panel title="Next step">
                  {d.actions.length ? (
                    <div className="flex flex-col gap-3">
                      <TagV2 text="Your turn" size={TagV2Size.SM} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                      {primary.map((a) => (
                        <ButtonV2 key={a} text={ACTION_LABEL[a] ?? a} buttonType={ButtonV2Type.PRIMARY} width="100%" onClick={() => setDrawer(a)} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-body text-fg-secondary">{d.waitingOn ? `Waiting on ${d.waitingOn}` : dep.status === 'ACTIVE' ? 'Running. Interest is paid as chosen; the FDR is with the member.' : 'No further steps.'}</p>
                  )}
                </Panel>
                {dep.payment && (
                  <Panel title="Receipt" subtitle={dep.payment.receiptNo}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Field label="Mode">{dep.payment.mode === 'CASH' ? 'Cash' : dep.payment.mode === 'TRANSFER' ? 'Bank transfer' : 'Cheque'}</Field>
                      <Field label="Date">{formatDisplayDate(dep.payment.date)}</Field>
                      <Field label="Received by">{dep.payment.byName}</Field>
                      <Field label="Reference">{dep.payment.reference ?? '—'}</Field>
                    </dl>
                    {dep.payment.denominations && (
                      <p className="mt-3 text-caption text-fg-secondary">
                        Notes:{' '}
                        {Object.entries(dep.payment.denominations)
                          .filter(([, n]) => n)
                          .sort((a, b) => Number(b[0]) - Number(a[0]))
                          .map(([v, n]) => `₹${v} × ${n}`)
                          .join(' · ')}
                      </p>
                    )}
                  </Panel>
                )}
                {(dep.signOffs?.secretary || dep.signOffs?.president) && (
                  <Panel title="Accepted by (D-027)">
                    <ol className="flex flex-col gap-2">
                      {(
                        [
                          ['Secretary', dep.signOffs?.secretary],
                          ['President', dep.signOffs?.president],
                        ] as const
                      ).map(([label, s]) => (
                        <li key={label} className="flex justify-between gap-3">
                          <span className="text-label text-fg">{label}</span>
                          <span className="text-caption text-fg-secondary">{s ? `${s.byName} · ${formatDisplayDateTime(s.at)}` : 'Pending'}</span>
                        </li>
                      ))}
                    </ol>
                  </Panel>
                )}
                {d.pledgedLoan && (
                  <Panel title="Pledged">
                    <p className="text-body text-fg-secondary">
                      Security for loan{' '}
                      <Link to={`/loans/${d.pledgedLoan.id}`} className="text-link hover:underline">
                        {d.pledgedLoan.loanNo}
                      </Link>{' '}
                      (outstanding <Money value={d.pledgedLoan.outstanding} />). It cannot be closed early.
                    </p>
                  </Panel>
                )}
              </div>
            </div>
            <ActionDrawer d={d} action={drawer} onClose={() => setDrawer(null)} today={demoState.data?.today ?? dep.openedOn} />
          </div>
        )}
      </ViewState>
    </>
  );
}
