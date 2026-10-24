// ST-01 Admin Dashboard (docs/04 §5): KPIs, what needs attention, pipeline, collections, risks.
import { ArrowRight, Banknote, CalendarClock, HandCoins, Inbox, PiggyBank, UserPlus, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  CardV2,
  CardV2Variant,
  ProgressBarV2,
  StatCardV2,
  StatCardV2ArrowDirection,
  StatCardV2ChangeType,
  StatCardV2Variant,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
} from '@juspay/blend-design-system';
import { formatCycle, formatDisplayDate, formatINRCompact, fullMonthsBetween } from '@tgs/domain';
import { ROLE_LABELS, type DashboardSummary, type LoanStatus, type MembershipStatus } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Illustration, ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

/** Card with a title row, used by every dashboard panel. */
function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-card border border-line bg-surface shadow-raised">
      <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-card-title text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-caption text-fg-tertiary">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  );
}

function NeedsAttention({ s }: { s: DashboardSummary }) {
  if (s.needsAction.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Illustration icon={Inbox} />
        <p className="text-label text-fg">You're all caught up</p>
        <p className="text-caption text-fg-tertiary">New applications will appear here when they reach your stage.</p>
      </div>
    );
  return (
    <ul className="-my-2 flex flex-col divide-y divide-line-subtle">
      {s.needsAction.map((item) => {
        const waited = daysBetween(item.since, s.asOf);
        const late = waited > 7 ? 'text-danger-fg' : waited > 3 ? 'text-warning-fg' : 'text-fg-tertiary';
        return (
          <li key={item.id} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 py-3">
            <div className="flex size-9 items-center justify-center rounded-control bg-brand-subtle text-brand-text">
              {item.kind === 'loan' ? <HandCoins size={18} strokeWidth={1.75} aria-hidden /> : <UserPlus size={18} strokeWidth={1.75} aria-hidden />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-label text-fg">{item.title}</span>
                {item.kind === 'loan' ? <StatusTag entity="loan" status={item.status as LoanStatus} /> : <StatusTag entity="membership" status={item.status as MembershipStatus} />}
              </div>
              <p className="truncate text-caption text-fg-tertiary">
                <span className="tabular">{item.ref}</span> · {item.subtitle}
              </p>
            </div>
            <div className="text-right">
              {item.amount !== undefined && <Money value={item.amount} className="block text-amount text-fg" />}
              <span className={`tabular text-caption ${late}`}>{waited === 0 ? 'Today' : `${waited} day${waited === 1 ? '' : 's'} waiting`}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const summary = useQuery({ queryKey: ['dashboard-summary', session?.user.id], queryFn: api.dashboard.summary });
  if (!session) return null;
  const firstName = session.user.name.split(' ')[0];
  const s = summary.data;
  const delta = s ? s.collectionRate - s.collectionRatePrev : 0;
  const pipelineMax = s ? Math.max(1, ...s.pipeline.map((r) => r.count)) : 1;
  const inFlight = s ? s.pipeline.reduce((a, r) => a + r.count, 0) : 0;
  const inFlightAmount = s ? s.pipeline.reduce((a, r) => a + r.amount, 0) : 0;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={s ? `${ROLE_LABELS[session.user.role]}${session.user.departmentId ? ' · your department only' : ''} · data as of ${formatDisplayDate(s.asOf)} · current cycle ${formatCycle(s.currentCycle)}` : ROLE_LABELS[session.user.role]}
        meta={s && s.myQueue > 0 ? <TagV2 text={`${s.myQueue} waiting on you`} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
        actions={<ButtonV2 text="Reports" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} onClick={() => navigate('/reports')} />}
      />

      <ViewState state={summary.isLoading ? 'loading' : summary.isError ? 'error' : 'ready'} layout="stats" onRetry={() => void summary.refetch()}>
        {s && (
          <div className="flex flex-col gap-6">
            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCardV2 title="Active members" value={s.activeMembers.toLocaleString('en-IN')} variant={StatCardV2Variant.NUMBER} titleIcon={<Users size={16} />} subtitle="Contributing this cycle" />
              <StatCardV2 title="Loans outstanding" value={formatINRCompact(s.loanOutstanding)} variant={StatCardV2Variant.NUMBER} titleIcon={<HandCoins size={16} />} subtitle={`${s.activeLoans} active loans`} />
              <StatCardV2 title="Deposits held" value={formatINRCompact(s.depositsHeld)} variant={StatCardV2Variant.NUMBER} titleIcon={<PiggyBank size={16} />} subtitle="FD, CRD, SRDS, Savings" />
              <StatCardV2
                title={`Collection · ${formatCycle(s.lastPostedCycle)}`}
                value={pct(s.collectionRate)}
                variant={StatCardV2Variant.NUMBER}
                titleIcon={<Banknote size={16} />}
                change={{
                  value: `${Math.abs(delta * 100).toFixed(1)} pts`,
                  changeType: delta >= 0 ? StatCardV2ChangeType.INCREASE : StatCardV2ChangeType.DECREASE,
                  arrowDirection: delta >= 0 ? StatCardV2ArrowDirection.UP : StatCardV2ArrowDirection.DOWN,
                }}
                subtitle="vs previous cycle"
              />
            </div>

            {/* Attention + collections */}
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Panel
                  title="Needs your attention"
                  subtitle={session.user.role === 'SUPER_ADMIN' ? 'Oldest items in flight across all stages' : 'Oldest items waiting on you'}
                  action={<ButtonV2 text="Open work queue" buttonType={ButtonV2Type.PRIMARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} rightSlot={{ slot: <ArrowRight size={14} /> }} onClick={() => navigate('/queue')} />}
                >
                  <NeedsAttention s={s} />
                </Panel>
              </div>
              <Panel title="Collections" subtitle="Recovered vs demand, last 6 cycles">
                <ul className="flex flex-col gap-4">
                  {s.collectionsTrend.map((t) => {
                    const rate = t.demand ? t.recovered / t.demand : 0;
                    return (
                      <li key={t.cycle} className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between text-caption">
                          <span className="text-fg-secondary">{formatCycle(t.cycle)}</span>
                          <span className="tabular text-fg">
                            {formatINRCompact(t.recovered)} <span className="text-fg-tertiary">/ {formatINRCompact(t.demand)}</span>
                            <span className="ml-2 text-caption-strong">{pct(rate)}</span>
                          </span>
                        </div>
                        <ProgressBarV2 value={rate * 100} aria-label={`${formatCycle(t.cycle)}: ${pct(rate)} collected`} />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>

            {/* Pipeline + short collections */}
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Panel title="Loan pipeline" subtitle={`${inFlight} applications in flight · ${formatINRCompact(inFlightAmount)}`}>
                  <ul className="-my-1 flex flex-col">
                    {s.pipeline.map((row) => (
                      <li key={row.status} className="grid grid-cols-[170px_1fr_64px_88px] items-center gap-4 py-2">
                        <StatusTag entity="loan" status={row.status as LoanStatus} />
                        <ProgressBarV2 value={(row.count / pipelineMax) * 100} aria-label={`${row.count} loans`} />
                        <span className="tabular text-right text-amount text-fg">{row.count}</span>
                        <span className="tabular text-right text-caption text-fg-tertiary">{formatINRCompact(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
              <Panel title="Short collections" subtitle={`By department · ${formatCycle(s.lastPostedCycle)}`}>
                {s.shortByDepartment.length === 0 ? (
                  <p className="py-6 text-center text-caption text-fg-tertiary">Every department recovered in full.</p>
                ) : (
                  <ul className="-my-2 flex flex-col divide-y divide-line-subtle">
                    {s.shortByDepartment.map((d) => (
                      <li key={d.departmentId} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-label text-fg">{d.department}</p>
                          <p className="text-caption text-fg-tertiary">
                            {d.shortMembers} member{d.shortMembers === 1 ? '' : 's'} short
                          </p>
                        </div>
                        <Money value={d.short} tone="debit" className="text-amount" />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            {/* Retirement risk */}
            <Panel
              title="Retiring in the next 6 months"
              subtitle={`${s.retiringSoon.count} members · ${formatINRCompact(s.retiringSoon.outstanding)} still outstanding (recover before or from gratuity)`}
              action={<CalendarClock size={18} className="text-fg-tertiary" aria-hidden />}
            >
              {s.retiringSoon.members.length === 0 ? (
                <p className="py-4 text-center text-caption text-fg-tertiary">No retirements in the next 6 months.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-overline uppercase tracking-wide text-fg-tertiary">
                        <th className="py-2 pr-4 font-semibold">Member</th>
                        <th className="py-2 pr-4 font-semibold">Department</th>
                        <th className="py-2 pr-4 font-semibold">Retires on</th>
                        <th className="py-2 pr-4 font-semibold">Service left</th>
                        <th className="py-2 text-right font-semibold">Loan outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {s.retiringSoon.members.map((m) => {
                        const left = Math.max(0, fullMonthsBetween(s.asOf, m.dor));
                        return (
                          <tr key={m.id} className="text-body">
                            <td className="py-2.5 pr-4">
                              <span className="text-label text-fg">{m.name}</span>
                              <span className="tabular ml-2 text-caption text-fg-tertiary">#{m.generalNo}</span>
                            </td>
                            <td className="py-2.5 pr-4 text-fg-secondary">{m.department}</td>
                            <td className="tabular py-2.5 pr-4 text-fg">{formatDisplayDate(m.dor)}</td>
                            <td className="py-2.5 pr-4">
                              <TagV2 text={left === 0 ? 'This month' : `${left} month${left === 1 ? '' : 's'}`} size={TagV2Size.XS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} color={left <= 2 ? TagV2Color.ERROR : TagV2Color.WARNING} />
                            </td>
                            <td className="py-2.5 text-right">
                              {m.outstanding > 0 ? <Money value={m.outstanding} className="text-amount text-fg" /> : <span className="text-caption text-fg-tertiary">No loans</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </ViewState>
    </>
  );
}
