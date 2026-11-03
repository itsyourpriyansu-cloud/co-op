// ST-43 Deduction entry & recovery (J-10 step 3, P7b D-088). The DDO enters what was actually deducted
// and submits; the Accountant enters a paper sheet, reviews a submitted one (correct, send back) and
// approves-and-posts. Each line shows the pay picture (R1: never more than the salary available), the
// live allocation for the selected row (allocateRecovery, BR-011) and what stays as dues (R2).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, FileUp, Send, Undo2 } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, ModalV2, SingleSelectV2, SnackbarV2Variant, TextAreaV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { allocateRecovery, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { fieldErrorsOf } from '@/components/Form';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { cycleLabel, ENTRY_LABEL } from './collections';

const LINE_FILTERS = [
  { label: 'All members', value: 'all' },
  { label: 'Partly recovered', value: 'short' },
  { label: 'Fully recovered', value: 'full' },
  { label: 'With earlier dues', value: 'outstanding' },
  { label: 'Not entered yet', value: 'pending' },
];

export function RecoveryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  const d = q.data;
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    if (d && !Object.keys(entered).length) setEntered(Object.fromEntries(d.lines.map((l) => [l.memberId, String((l.deducted ?? l.totalDemand) / 100)])));
    if (d && !selected) setSelected(d.lines[0]?.memberId ?? null);
  }, [d, entered, selected]);

  const can = (a: string) => Boolean(d?.actions.includes(a));
  const canPost = can('postRecovery');
  const isDdo = can('submitEntry');
  const editable = canPost || can('saveEntry');
  const amountOf = (memberId: string) => Math.round(Number(entered[memberId] ?? 0) * 100);
  const rows = useMemo(
    () =>
      (d?.lines ?? []).map((l) => {
        const amount = amountOf(l.memberId);
        const overSalary = l.availableSalary !== undefined && amount > l.availableSalary;
        return { ...l, amount, short: Math.max(0, l.totalDemand - amount), excess: amount > l.totalDemand, overSalary, salaryLeft: l.availableSalary !== undefined ? l.availableSalary - amount : undefined };
      }),
    [d, entered], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visible = rows.filter((r) => (filter === 'short' ? r.short > 0 : filter === 'full' ? r.short === 0 : filter === 'outstanding' ? (r.previousOutstanding ?? 0) > 0 : filter === 'pending' ? r.deducted === undefined : true));
  const totals = { demand: rows.reduce((s, r) => s + r.totalDemand, 0), recovered: rows.reduce((s, r) => s + r.amount, 0), shortMembers: rows.filter((r) => r.short > 0).length, invalid: rows.filter((r) => r.excess || r.overSalary).length };
  const sel = rows.find((r) => r.memberId === selected);
  const preview = sel ? allocateRecovery(sel.components, Math.min(sel.amount, sel.totalDemand)) : undefined;
  const deductions = () => Object.fromEntries(rows.map((r) => [r.memberId, r.amount]));

  const done = (next: DemandSheetDetail, header: string) => {
    qc.setQueryData(['demand-sheet', id], next);
    void qc.invalidateQueries({ queryKey: ['demand-overview'] });
    void qc.invalidateQueries({ queryKey: ['work-queue'] });
    addSnackbarV2({ header, variant: SnackbarV2Variant.SUCCESS });
  };
  const save = useMutation({ mutationFn: () => api.demand.entry(id, 'saveEntry', { deductions: deductions() }), onSuccess: (next) => done(next, 'Deductions saved') });
  const submit = useMutation({
    mutationFn: async () => {
      await api.demand.entry(id, 'saveEntry', { deductions: deductions() });
      return api.demand.entry(id, 'submitEntry');
    },
    onSuccess: (next) => {
      done(next, 'Submitted to the Accountant');
      navigate(`/demand-sheets/${id}`);
    },
  });
  const reject = useMutation({
    mutationFn: () => api.demand.entry(id, 'rejectEntry', { reason: reason.trim() }),
    onSuccess: (next) => {
      setRejecting(false);
      done(next, 'Sent back to the DDO');
      navigate(`/demand-sheets/${id}`);
    },
  });
  const post = useMutation({
    mutationFn: () => api.demand.act(id, 'postRecovery', { recovered: deductions() }),
    onSuccess: (next) => {
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      done(next, `Recovery posted · ${next.lines.length} receipts · ${next.totals.shortMembers} short`);
      navigate(`/demand-sheets/${id}`);
    },
    onError: () => setConfirm(false),
  });
  const failed = post.error ?? save.error ?? submit.error;
  const errors = { ...fieldErrorsOf(failed), ...Object.fromEntries(Object.entries(fieldErrorsOf(failed)).map(([k, v]) => [k.replace(/^deductions\./, 'recovered.'), v])) };

  /** Simulated DDO statement: everyone in full except two members (deterministic), one at 60% and one at 0. */
  const importStatement = () => {
    if (!d) return;
    const next = Object.fromEntries(d.lines.map((l) => [l.memberId, String(Math.min(l.totalDemand, l.availableSalary ?? l.totalDemand) / 100)]));
    const withLoans = d.lines.filter((l) => l.components.some((c) => c.head === 'PRINCIPAL'));
    const a = withLoans[1] ?? d.lines[1];
    const b = withLoans[3] ?? d.lines[3];
    if (a) next[a.memberId] = String(Math.round((a.totalDemand * 0.6) / 100));
    if (b) next[b.memberId] = '0';
    setEntered(next);
    setSelected(a?.memberId ?? null);
    addSnackbarV2({ header: 'DDO statement imported (demo)', description: '2 members came short. Check the allocation before posting.', variant: SnackbarV2Variant.INFO });
  };

  const entry = d?.sheet.entry;
  const title = isDdo ? 'Enter deductions' : entry && (entry.status === 'SUBMITTED' || entry.status === 'UNDER_REVIEW') ? 'Review deductions' : 'Enter recovery';

  return (
    <>
      <ButtonV2 text="Demand sheet" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(`/demand-sheets/${id}`)} />
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail" onRetry={() => void q.refetch()}>
        {d && (
          <div className="mt-3">
            <PageHeader
              title={`${title} · ${d.department?.name}`}
              description={`${cycleLabel(d.sheet.cycle)}: ${isDdo ? 'type what was actually deducted from each salary, save, then submit to the Accountant.' : 'type what the DDO actually deducted (from the DDO’s entry or a paper sheet). A short amount is applied in the agreement’s order (BR-011) and the rest stays as the member’s dues.'} A deduction can never be more than the demand or the salary available.`}
              actions={
                editable ? (
                  <div className="flex gap-2">
                    {canPost && <ButtonV2 text="Import DDO statement" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FileUp size={16} /> }} onClick={importStatement} />}
                    <ButtonV2 text="Mark all fully recovered" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <CheckCheck size={16} /> }} onClick={() => setEntered(Object.fromEntries(d.lines.map((l) => [l.memberId, String(l.totalDemand / 100)])))} />
                  </div>
                ) : undefined
              }
            />
            {entry && <AlertV2 type={entry.status === 'REJECTED' ? AlertV2Type.WARNING : AlertV2Type.PRIMARY} subType={AlertV2SubType.SUBTLE} heading={`Deductions ${ENTRY_LABEL[entry.status]}${entry.source === 'PHYSICAL_SHEET' ? ' (paper sheet)' : ' (entered online by the DDO)'}`} description={entry.status === 'REJECTED' ? `${entry.rejection?.byName}: ${entry.rejection?.remarks ?? ''}` : entry.submitted ? `Submitted by ${entry.submitted.byName}.` : entry.savedBy ? `Last saved by ${entry.savedBy.byName}.` : ''} />}
            {!editable && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Nothing to enter now" description={d.sheet.status === 'RECOVERY_POSTED' ? 'Recovery is already posted.' : d.sheet.status !== 'SENT_TO_DDO' ? 'The Accountant certifies and sends the sheet to the DDO first.' : 'The deductions are with the Accountant for review.'} />}

            <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_380px]">
              <section className="overflow-hidden rounded-card border border-line bg-surface shadow-raised">
                <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-5 py-3">
                  <p className="text-caption text-fg-tertiary">{visible.length} of {rows.length} members</p>
                  <div className="w-52">
                    <SingleSelectV2 placeholder="Show" items={[{ items: LINE_FILTERS }]} selected={filter} onSelect={setFilter} />
                  </div>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[820px] text-left text-body">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                        <th className="px-5 py-3 font-semibold">Member</th>
                        <th className="px-3 py-3 text-right font-semibold">Demand</th>
                        <th className="px-3 py-3 text-right font-semibold">Earlier dues</th>
                        <th className="px-3 py-3 text-right font-semibold">Salary available</th>
                        <th className="w-44 px-3 py-3 text-right font-semibold">Deducted (₹)</th>
                        <th className="px-3 py-3 text-right font-semibold">Salary left</th>
                        <th className="px-5 py-3 text-right font-semibold">Unpaid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {visible.map((r) => {
                        const err = errors[`recovered.${r.memberId}`] ?? (r.excess ? 'More than the demand' : r.overSalary ? 'More than the salary available' : undefined);
                        return (
                          <tr key={r.memberId} onClick={() => setSelected(r.memberId)} className={cn('cursor-pointer', selected === r.memberId ? 'bg-brand-subtle' : 'hover:bg-surface-subtle')}>
                            <td className="px-5 py-2">
                              <p className="text-label text-fg">{r.name}</p>
                              <p className="tabular text-caption text-fg-tertiary">
                                No. {r.generalNo}
                                {r.enteredByName ? ` · ${r.entrySource === 'PHYSICAL_SHEET' ? 'paper' : 'online'}, ${r.enteredByName}` : ''}
                              </p>
                              {r.note && <p className="text-caption text-warning-fg">{r.note}</p>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Money value={r.totalDemand} />
                            </td>
                            <td className="px-3 py-2 text-right">{r.previousOutstanding ? <Money value={r.previousOutstanding} tone="debit" /> : '—'}</td>
                            <td className="px-3 py-2 text-right">{r.availableSalary !== undefined ? <Money value={r.availableSalary} /> : <span className="text-caption text-fg-tertiary">Pay not certified</span>}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                aria-label={`Deducted from ${r.name}`}
                                inputMode="decimal"
                                disabled={!editable}
                                value={entered[r.memberId] ?? ''}
                                onFocus={() => setSelected(r.memberId)}
                                onChange={(e) => setEntered((s) => ({ ...s, [r.memberId]: e.target.value.replace(/[^0-9.]/g, '') }))}
                                className={cn('tabular h-9 w-32 rounded-control border bg-surface px-2.5 text-right text-body outline-none focus:border-brand disabled:opacity-70', err ? 'border-danger-border' : r.short ? 'border-warning-border' : 'border-line')}
                              />
                              {err && <p className="mt-1 text-caption text-danger-fg">{err}</p>}
                            </td>
                            <td className="px-3 py-2 text-right">{r.salaryLeft !== undefined ? <Money value={Math.max(0, r.salaryLeft)} /> : '—'}</td>
                            <td className="px-5 py-2 text-right">{r.short ? <Money value={r.short} tone="debit" /> : <span className="text-caption text-success-fg">In full</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
                <section className="rounded-card border border-line bg-surface shadow-raised">
                  <header className="border-b border-line-subtle px-5 py-4">
                    <h2 className="text-card-title text-fg">{sel ? sel.name : 'Allocation'}</h2>
                    <p className="text-caption text-fg-tertiary">How {sel ? formatINR(Math.min(sel.amount, sel.totalDemand)) : 'the amount'} is applied (BR-011)</p>
                  </header>
                  <ol className="divide-y divide-line-subtle">
                    {(preview?.components ?? []).map((c, i) => {
                      const comp = sel!.components[i]!;
                      return (
                        <li key={i} className="flex items-center justify-between gap-3 px-5 py-2">
                          <span className="text-caption text-fg">
                            {i + 1}. {comp.label}
                            {comp.loanNo ? <span className="text-fg-tertiary"> · {comp.loanNo}</span> : null}
                          </span>
                          <span className="tabular text-caption">
                            <span className={c.allocated < c.amount ? 'text-danger-fg' : 'text-success-fg'}>{formatINR(c.allocated)}</span>
                            <span className="text-fg-tertiary"> / {formatINR(c.amount)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {sel && sel.short > 0 && <p className="border-t border-line-subtle px-5 py-3 text-caption text-danger-fg">Unpaid {formatINR(sel.short)} stays as the member's dues; they pay at the counter or report a bank payment. It is not added to next month's sheet.</p>}
                </section>

                <section className="rounded-card border border-line bg-surface px-5 py-4 shadow-raised">
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-caption text-fg-tertiary">Demand</dt>
                      <dd className="text-label text-fg">
                        <Money value={totals.demand} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-tertiary">Deducted</dt>
                      <dd className="text-label text-fg">
                        <Money value={totals.recovered} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-tertiary">Unpaid</dt>
                      <dd className="text-label text-danger-fg">
                        <Money value={Math.max(0, totals.demand - totals.recovered)} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-tertiary">Members short</dt>
                      <dd className="tabular text-label text-fg">{totals.shortMembers}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex flex-col gap-2">
                    {can('saveEntry') && <ButtonV2 text="Save draft" buttonType={ButtonV2Type.SECONDARY} width="100%" loading={save.isPending} disabled={totals.invalid > 0} onClick={() => save.mutate()} />}
                    {isDdo && <ButtonV2 text="Submit to the Accountant" width="100%" leftSlot={{ slot: <Send size={16} /> }} loading={submit.isPending} disabled={totals.invalid > 0} onClick={() => submit.mutate()} />}
                    {can('rejectEntry') && <ButtonV2 text="Send back to the DDO" buttonType={ButtonV2Type.SECONDARY} width="100%" leftSlot={{ slot: <Undo2 size={16} /> }} onClick={() => setRejecting(true)} />}
                    {canPost && <ButtonV2 text="Approve and post" width="100%" disabled={totals.invalid > 0} onClick={() => setConfirm(true)} />}
                  </div>
                  {failed && !Object.keys(errors).length && <p className="mt-2 text-caption text-danger-fg">{isApiError(failed) ? failed.message : 'Could not save.'}</p>}
                </section>
              </div>
            </div>

            <ModalV2
              isOpen={confirm}
              onClose={() => setConfirm(false)}
              title={`Post ${formatINR(totals.recovered)} for ${d.lines.length} members?`}
              subtitle="Creates one salary-recovery receipt per member, updates loans, CRD, SRDS and shares, posts to the ledger and notifies members. This cannot be undone."
              primaryAction={{ text: post.isPending ? 'Posting…' : 'Yes, approve and post', onClick: () => post.mutate() }}
              secondaryAction={{ text: 'Cancel', buttonType: ButtonV2Type.SECONDARY, onClick: () => setConfirm(false) }}
            >
              <p className="text-body text-fg-secondary">{totals.shortMembers ? `${totals.shortMembers} member${totals.shortMembers === 1 ? '' : 's'} came short by ${formatINR(Math.max(0, totals.demand - totals.recovered))} in total.` : 'Everyone recovered in full.'}</p>
            </ModalV2>
            <ModalV2
              isOpen={rejecting}
              onClose={() => setRejecting(false)}
              title="Send the deductions back to the DDO?"
              subtitle="The DDO sees your reason, corrects the amounts and submits again."
              primaryAction={{ text: reject.isPending ? 'Sending…' : 'Send back', onClick: () => reject.mutate(), disabled: reason.trim().length < 10 }}
              secondaryAction={{ text: 'Cancel', buttonType: ButtonV2Type.SECONDARY, onClick: () => setRejecting(false) }}
            >
              <TextAreaV2 label="What to correct" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Check the deduction for No. 1103 against the pay bill" />
              {reject.error && <p className="mt-2 text-caption text-danger-fg">{isApiError(reject.error) ? reject.error.message : 'Try again.'}</p>}
            </ModalV2>
          </div>
        )}
      </ViewState>
    </>
  );
}
