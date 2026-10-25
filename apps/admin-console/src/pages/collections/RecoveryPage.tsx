// ST-43 Recovery entry & allocation (J-10 step 3): recovered amount per member (default = demand),
// "Mark all fully recovered", a simulated DDO statement import, the live allocation for the selected
// row (allocateRecovery, BR-011), then Post → receipts, ledgers, sheet "Recovery posted".
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, FileUp } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, ModalV2, SnackbarV2Variant, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { allocateRecovery, formatINR } from '@tgs/domain';
import { fieldErrorsOf } from '@/components/Form';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { cycleLabel } from './collections';

export function RecoveryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  const d = q.data;
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (d && !Object.keys(entered).length) setEntered(Object.fromEntries(d.lines.map((l) => [l.memberId, String(l.totalDemand / 100)])));
    if (d && !selected) setSelected(d.lines[0]?.memberId ?? null);
  }, [d, entered, selected]);

  const amountOf = (memberId: string) => Math.round(Number(entered[memberId] ?? 0) * 100);
  const rows = useMemo(() => (d?.lines ?? []).map((l) => ({ ...l, recovered: amountOf(l.memberId), short: Math.max(0, l.totalDemand - amountOf(l.memberId)), excess: amountOf(l.memberId) > l.totalDemand })), [d, entered]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = { demand: rows.reduce((s, r) => s + r.totalDemand, 0), recovered: rows.reduce((s, r) => s + r.recovered, 0), shortMembers: rows.filter((r) => r.short > 0).length, excess: rows.filter((r) => r.excess).length };
  const sel = rows.find((r) => r.memberId === selected);
  const preview = sel ? allocateRecovery(sel.components, Math.min(sel.recovered, sel.totalDemand)) : undefined;

  const post = useMutation({
    mutationFn: () => api.demand.act(id, 'postRecovery', { recovered: Object.fromEntries(rows.map((r) => [r.memberId, r.recovered])) }),
    onSuccess: (next) => {
      qc.setQueryData(['demand-sheet', id], next);
      void qc.invalidateQueries({ queryKey: ['demand-overview'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      addSnackbarV2({ header: 'Recovery posted', description: `${next.lines.length} receipts · ${next.totals.shortMembers} short`, variant: SnackbarV2Variant.SUCCESS });
      navigate(`/demand-sheets/${id}`);
    },
    onError: () => setConfirm(false),
  });
  const errors = fieldErrorsOf(post.error);

  /** Simulated DDO statement: everyone in full except two members (deterministic), one at 60% and one at 0. */
  const importStatement = () => {
    if (!d) return;
    const next = Object.fromEntries(d.lines.map((l) => [l.memberId, String(l.totalDemand / 100)]));
    const withLoans = d.lines.filter((l) => l.components.some((c) => c.head === 'PRINCIPAL'));
    const a = withLoans[1] ?? d.lines[1];
    const b = withLoans[3] ?? d.lines[3];
    if (a) next[a.memberId] = String(Math.round((a.totalDemand * 0.6) / 100));
    if (b) next[b.memberId] = '0';
    setEntered(next);
    setSelected(a?.memberId ?? null);
    addSnackbarV2({ header: 'DDO statement imported (demo)', description: '2 members came short. Check the allocation before posting.', variant: SnackbarV2Variant.INFO });
  };

  return (
    <>
      <ButtonV2 text="Demand sheet" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(`/demand-sheets/${id}`)} />
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail" onRetry={() => void q.refetch()}>
        {d && (
          <div className="mt-3">
            <PageHeader
              title={`Enter recovery · ${d.department?.name}`}
              description={`${cycleLabel(d.sheet.cycle)}: type what the DDO actually deducted for each member. A short amount is applied in the agreement's order (BR-011) and the rest becomes the member's dues.`}
              actions={
                <div className="flex gap-2">
                  <ButtonV2 text="Import DDO statement" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FileUp size={16} /> }} onClick={importStatement} />
                  <ButtonV2 text="Mark all fully recovered" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <CheckCheck size={16} /> }} onClick={() => setEntered(Object.fromEntries(d.lines.map((l) => [l.memberId, String(l.totalDemand / 100)])))} />
                </div>
              }
            />
            {!d.actions.includes('postRecovery') && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Not ready to post" description={d.sheet.status === 'RECOVERY_POSTED' ? 'Recovery is already posted.' : 'Certify and send the sheet to the DDO first. Only the Accountant posts recoveries.'} />}

            <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_380px]">
              <section className="overflow-hidden rounded-card border border-line bg-surface shadow-raised">
                <div className="max-h-[560px] overflow-y-auto">
                  <table className="w-full text-left text-body">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                        <th className="px-5 py-3 font-semibold">Member</th>
                        <th className="px-3 py-3 text-right font-semibold">Demand</th>
                        <th className="w-44 px-3 py-3 text-right font-semibold">Recovered (₹)</th>
                        <th className="px-5 py-3 text-right font-semibold">Short</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {rows.map((r) => (
                        <tr key={r.memberId} onClick={() => setSelected(r.memberId)} className={cn('cursor-pointer', selected === r.memberId ? 'bg-brand-subtle' : 'hover:bg-surface-subtle')}>
                          <td className="px-5 py-2">
                            <p className="text-label text-fg">{r.name}</p>
                            <p className="tabular text-caption text-fg-tertiary">No. {r.generalNo}</p>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Money value={r.totalDemand} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              aria-label={`Recovered from ${r.name}`}
                              inputMode="decimal"
                              value={entered[r.memberId] ?? ''}
                              onFocus={() => setSelected(r.memberId)}
                              onChange={(e) => setEntered((s) => ({ ...s, [r.memberId]: e.target.value.replace(/[^0-9.]/g, '') }))}
                              className={cn('tabular h-9 w-32 rounded-control border bg-surface px-2.5 text-right text-body outline-none focus:border-brand', r.excess || errors[`recovered.${r.memberId}`] ? 'border-danger-border' : r.short ? 'border-warning-border' : 'border-line')}
                            />
                            {(r.excess || errors[`recovered.${r.memberId}`]) && <p className="mt-1 text-caption text-danger-fg">{errors[`recovered.${r.memberId}`] ?? 'More than the demand'}</p>}
                          </td>
                          <td className="px-5 py-2 text-right">{r.short ? <Money value={r.short} tone="debit" /> : <span className="text-caption text-success-fg">In full</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
                <section className="rounded-card border border-line bg-surface shadow-raised">
                  <header className="border-b border-line-subtle px-5 py-4">
                    <h2 className="text-card-title text-fg">{sel ? sel.name : 'Allocation'}</h2>
                    <p className="text-caption text-fg-tertiary">How {sel ? formatINR(Math.min(sel.recovered, sel.totalDemand)) : 'the amount'} is applied (BR-011)</p>
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
                  {sel && sel.short > 0 && <p className="border-t border-line-subtle px-5 py-3 text-caption text-danger-fg">Unpaid {formatINR(sel.short)} carries to the member's dues; they can pay at the counter or report a bank payment.</p>}
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
                      <dt className="text-caption text-fg-tertiary">Recovered</dt>
                      <dd className="text-label text-fg">
                        <Money value={totals.recovered} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-tertiary">Short</dt>
                      <dd className="text-label text-danger-fg">
                        <Money value={Math.max(0, totals.demand - totals.recovered)} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-fg-tertiary">Members short</dt>
                      <dd className="tabular text-label text-fg">{totals.shortMembers}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <ButtonV2 text="Post recovery" width="100%" disabled={!d.actions.includes('postRecovery') || totals.excess > 0} onClick={() => setConfirm(true)} />
                  </div>
                  {post.error && !Object.keys(errors).length && <p className="mt-2 text-caption text-danger-fg">{isApiError(post.error) ? post.error.message : 'Could not post.'}</p>}
                </section>
              </div>
            </div>

            <ModalV2
              isOpen={confirm}
              onClose={() => setConfirm(false)}
              title={`Post ${formatINR(totals.recovered)} for ${d.lines.length} members?`}
              subtitle="Creates one salary-recovery receipt per member, updates loans, CRD, SRDS and shares, and notifies members. This cannot be undone."
              primaryAction={{ text: post.isPending ? 'Posting…' : 'Yes, post', onClick: () => post.mutate() }}
              secondaryAction={{ text: 'Cancel', buttonType: ButtonV2Type.SECONDARY, onClick: () => setConfirm(false) }}
            >
              <p className="text-body text-fg-secondary">{totals.shortMembers ? `${totals.shortMembers} member${totals.shortMembers === 1 ? '' : 's'} came short by ${formatINR(Math.max(0, totals.demand - totals.recovered))} in total.` : 'Everyone recovered in full.'}</p>
            </ModalV2>
          </div>
        )}
      </ViewState>
    </>
  );
}
