// ST-40 Demand sheets index: one row per department for the chosen cycle — members, demand,
// recovered, short, status — and the next step for the signed-in user. Generate → ST-41, row → ST-42.
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, CircleAlert, FileSpreadsheet, Plus, TrendingDown } from 'lucide-react';
import { ButtonV2, SingleSelectV2, StatCardV2, StatCardV2Variant, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { formatINRCompact } from '@tgs/domain';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { cycleLabel } from './collections';

export function DemandSheetsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const cycle = params.get('cycle') ?? undefined;
  const q = useQuery({ queryKey: ['demand-overview', cycle ?? 'current'], queryFn: () => api.demand.overview(cycle), refetchInterval: 10_000 });
  const d = q.data;
  const pct = d && d.totals.demand ? (d.totals.recovered / d.totals.demand) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Demand sheets"
        description={`Monthly salary deductions by department: generate, certify (BR-030), send to the DDO, then post what was recovered${d?.scope.departmentName ? ` · ${d.scope.departmentName} only` : ''}.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <SingleSelectV2 placeholder="Cycle" items={[{ items: (d?.cycles ?? []).map((c) => ({ label: `${cycleLabel(c)}${c === d?.currentCycle ? ' (current)' : ''}`, value: c })) }]} selected={d?.cycle ?? ''} onSelect={(c) => setParams({ cycle: c })} />
            </div>
            {d?.canGenerate && d.totals.notGenerated > 0 && <ButtonV2 text="Generate" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => navigate(`/demand-sheets/generate?cycle=${d.cycle}`)} />}
          </div>
        }
      />

      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="table" onRetry={() => void q.refetch()}>
        {d && (
          <>
            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCardV2 title={`Demand · ${cycleLabel(d.cycle)}`} value={formatINRCompact(d.totals.demand)} variant={StatCardV2Variant.NUMBER} titleIcon={<FileSpreadsheet size={16} />} subtitle={`${d.totals.generated} of ${d.rows.length} departments generated`} />
              <StatCardV2 title="Recovered" value={formatINRCompact(d.totals.recovered)} variant={StatCardV2Variant.NUMBER} titleIcon={<Banknote size={16} />} subtitle={d.totals.posted ? `${pct.toFixed(1)}% of demand · ${d.totals.posted} posted` : 'Nothing posted yet'} />
              <StatCardV2 title="Short" value={formatINRCompact(d.totals.short)} variant={StatCardV2Variant.NUMBER} titleIcon={<TrendingDown size={16} />} subtitle={`${d.rows.reduce((s, r) => s + r.shortMembers, 0)} members short`} />
              <StatCardV2 title="Waiting on you" value={String(d.rows.filter((r) => r.myAction).length)} variant={StatCardV2Variant.NUMBER} titleIcon={<CircleAlert size={16} />} subtitle={d.totals.notGenerated ? `${d.totals.notGenerated} not generated yet` : 'Every department generated'} />
            </div>

            <section className="overflow-x-auto rounded-card border border-line bg-surface shadow-raised">
              <table className="w-full min-w-[920px] text-left">
                <thead>
                  <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                    <th className="px-5 py-3 font-semibold">Department</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 text-right font-semibold">Members</th>
                    <th className="px-3 py-3 text-right font-semibold">Demand</th>
                    <th className="px-3 py-3 text-right font-semibold">Recovered</th>
                    <th className="px-3 py-3 text-right font-semibold">Short</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {d.rows.map((r) => (
                    <tr
                      key={r.departmentId}
                      className={cn('text-body', r.id ? 'cursor-pointer hover:bg-surface-subtle' : 'text-fg-tertiary')}
                      onClick={() => r.id && navigate(`/demand-sheets/${r.id}`)}
                      {...(r.id ? { role: 'link', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && navigate(`/demand-sheets/${r.id}`) } : {})}
                    >
                      <td className="px-5 py-3">
                        <p className="text-label text-fg">{r.departmentName}</p>
                        <p className="text-caption text-fg-tertiary">DDO {r.ddoName}</p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusTag entity="demandSheet" status={r.status} />
                      </td>
                      <td className="tabular px-3 py-3 text-right">{r.members || '—'}</td>
                      <td className="px-3 py-3 text-right">{r.demand ? <Money value={r.demand} /> : '—'}</td>
                      <td className="px-3 py-3 text-right">{r.status === 'RECOVERY_POSTED' ? <Money value={r.recovered} /> : '—'}</td>
                      <td className="px-3 py-3 text-right">
                        {r.status === 'RECOVERY_POSTED' ? (
                          r.short ? (
                            <span className="text-danger-fg">
                              <Money value={r.short} /> <span className="text-caption">· {r.shortMembers}</span>
                            </span>
                          ) : (
                            <span className="text-caption text-success-fg">In full</span>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.myAction ? (
                          <TagV2 text={r.myAction} size={TagV2Size.SM} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} rightSlot={{ slot: <ArrowRight size={12} /> }} />
                        ) : r.status === 'NOT_GENERATED' ? (
                          <span className="text-caption">Not generated</span>
                        ) : (
                          <ArrowRight size={16} className="inline text-fg-tertiary" aria-hidden />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </ViewState>
    </>
  );
}
