// ST-41 Generate demand sheet (J-10 step 1): choose the cycle and departments → preview per
// department (members, totals per head, warnings) → Generate. Already generated ones are skipped.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, Checkbox, CheckboxSize, SnackbarV2Variant, TabsV2, TabsV2List, TabsV2Trigger, TabsV2Variant, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import type { DemandHead } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { HEAD_COLUMNS, cycleLabel } from './collections';

export function GenerateDemandPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const overview = useQuery({ queryKey: ['demand-overview', 'current'], queryFn: () => api.demand.overview() });
  const latest = overview.data?.cycles[0];
  const options = overview.data ? overview.data.cycles.slice(0, 2).reverse() : [];
  const [cycle, setCycle] = useState(params.get('cycle') ?? '');
  useEffect(() => {
    if (!cycle && latest) setCycle(params.get('cycle') ?? overview.data!.currentCycle);
  }, [cycle, latest, params, overview.data]);
  const preview = useQuery({ queryKey: ['demand-preview', cycle], queryFn: () => api.demand.preview(cycle), enabled: Boolean(cycle) });
  const [picked, setPicked] = useState<string[]>([]);
  const open = useMemo(() => (preview.data?.rows ?? []).filter((r) => !r.alreadyGenerated), [preview.data]);
  useEffect(() => setPicked(open.map((r) => r.departmentId)), [open]);
  const heads = HEAD_COLUMNS.filter((c) => (preview.data?.rows ?? []).some((r) => (r.heads[c.head] ?? 0) > 0));
  const chosen = open.filter((r) => picked.includes(r.departmentId));
  const total = (h?: DemandHead) => chosen.reduce((s, r) => s + (h ? (r.heads[h] ?? 0) : r.total), 0);

  const gen = useMutation({
    mutationFn: () => api.demand.generate(cycle, picked),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['demand-overview'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      addSnackbarV2({ header: `Generated ${r.generated.length} sheet${r.generated.length === 1 ? '' : 's'}`, description: `${cycleLabel(cycle)} · certify each one before sending to the DDO`, variant: SnackbarV2Variant.SUCCESS });
      navigate(`/demand-sheets?cycle=${cycle}`);
    },
  });

  return (
    <>
      <ButtonV2 text="Demand sheets" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/demand-sheets')} />
      <div className="mt-3">
        <PageHeader
          title="Generate demand"
          description="Builds each member's deduction from today's records: RRF, insurance (collection month), CRD, SRDS, first-demand shares and the instalment of every running loan (BR-009). Transfers count from their effective cycle (BR-010)."
          actions={
            options.length ? (
              <TabsV2 value={cycle} onValueChange={setCycle}>
                <TabsV2List variant={TabsV2Variant.BOXED}>
                  {options.map((c) => (
                    <TabsV2Trigger key={c} value={c} variant={TabsV2Variant.BOXED}>
                      {cycleLabel(c)}
                    </TabsV2Trigger>
                  ))}
                </TabsV2List>
              </TabsV2>
            ) : undefined
          }
        />
      </div>

      <ViewState state={preview.isLoading || overview.isLoading ? 'loading' : preview.isError ? 'error' : 'ready'} layout="table" onRetry={() => void preview.refetch()}>
        {preview.data && (
          <div className="flex flex-col gap-5">
            {preview.data.insuranceMonth && <AlertV2 type={AlertV2Type.PRIMARY} subType={AlertV2SubType.SUBTLE} heading="Insurance month" description="This cycle collects the yearly insurance contribution (BR-008)." />}
            {!open.length && <AlertV2 type={AlertV2Type.SUCCESS} subType={AlertV2SubType.SUBTLE} heading={`Every department is generated for ${cycleLabel(cycle)}`} description="Open a sheet from the index to certify or post it." />}
            <section className="overflow-x-auto rounded-card border border-line bg-surface shadow-raised">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                    <th className="w-10 px-5 py-3" />
                    <th className="px-2 py-3 font-semibold">Department</th>
                    <th className="px-2 py-3 text-right font-semibold">Members</th>
                    {heads.map((h) => (
                      <th key={h.head} className="px-2 py-3 text-right font-semibold">
                        {h.label}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {preview.data.rows.map((r) => (
                    <tr key={r.departmentId} className={r.alreadyGenerated ? 'text-fg-tertiary' : 'text-body'}>
                      <td className="px-5 py-3">
                        {!r.alreadyGenerated && (
                          <>
                            {/* Blend's Checkbox takes no aria-label; a hidden <label for> names it for screen readers. */}
                            <label htmlFor={`gen-${r.departmentId}`} className="sr-only">
                              Generate for {r.departmentName}
                            </label>
                            <Checkbox id={`gen-${r.departmentId}`} checked={picked.includes(r.departmentId)} onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, r.departmentId] : p.filter((x) => x !== r.departmentId)))} size={CheckboxSize.SMALL} />
                          </>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <p className={r.alreadyGenerated ? 'text-label' : 'text-label text-fg'}>{r.departmentName}</p>
                        {r.warnings.map((w) => (
                          <p key={w} className={`flex items-center gap-1 text-caption ${r.alreadyGenerated ? 'text-fg-tertiary' : 'text-warning-fg'}`}>
                            {!r.alreadyGenerated && <TriangleAlert size={12} aria-hidden />} {w}
                          </p>
                        ))}
                      </td>
                      <td className="tabular px-2 py-3 text-right">{r.members}</td>
                      {heads.map((h) => (
                        <td key={h.head} className="px-2 py-3 text-right">
                          {r.heads[h.head] ? <Money value={r.heads[h.head]!} /> : '—'}
                        </td>
                      ))}
                      <td className="px-5 py-3 text-right text-label">
                        <Money value={r.total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {chosen.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface-subtle text-label text-fg">
                      <td className="px-5 py-3" />
                      <td className="px-2 py-3">To generate · {chosen.length} departments</td>
                      <td className="tabular px-2 py-3 text-right">{chosen.reduce((s, r) => s + r.members, 0)}</td>
                      {heads.map((h) => (
                        <td key={h.head} className="px-2 py-3 text-right">
                          <Money value={total(h.head)} />
                        </td>
                      ))}
                      <td className="px-5 py-3 text-right">
                        <Money value={total()} />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </section>
            {gen.error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't generate" description={isApiError(gen.error) ? gen.error.message : 'Try again.'} />}
            {open.length > 0 && (
              <div className="flex items-center justify-end gap-3">
                <span className="text-caption text-fg-tertiary">{overview.data?.canGenerate === false ? 'Only the Accountant generates demand sheets.' : `${chosen.length} of ${open.length} selected`}</span>
                <ButtonV2 text={`Generate ${chosen.length} sheet${chosen.length === 1 ? '' : 's'}`} disabled={!chosen.length || overview.data?.canGenerate === false} loading={gen.isPending} onClick={() => gen.mutate()} />
              </div>
            )}
          </div>
        )}
      </ViewState>
    </>
  );
}
