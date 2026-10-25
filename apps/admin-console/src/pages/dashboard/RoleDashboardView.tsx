// ST-01 role variants (docs/04 §5, D-063): Accountant, Secretary / President (signer), Cashier and DDO.
// Built from GET /dashboard/role, which is computed from the same Work Queue, so counts always agree.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, CalendarCheck, CircleCheck, FileSpreadsheet, HandCoins, Inbox, PiggyBank, ReceiptIndianRupee, UserPlus, type LucideIcon } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, ProgressBarV2, StatCardV2, StatCardV2Variant } from '@juspay/blend-design-system';
import { formatCycle, formatDisplayDate, formatINR, formatINRCompact } from '@tgs/domain';
import type { DashboardSummary, DemandSheetStatus, LoanStatus, MembershipStatus, DepositStatus, RoleDashboard } from '@tgs/types';
import { Money } from '@/components/Money';
import { Panel } from '@/components/Panel';
import { StatusTag } from '@/components/StatusTag';
import { Illustration } from '@/components/ViewState';
import { cn } from '@/lib/utils';

const TILE_ICON: Record<string, LucideIcon> = { waiting: Inbox, sheets: FileSpreadsheet, reports: ReceiptIndianRupee, applied: HandCoins, amount: HandCoins, signed: CircleCheck, oldest: CalendarCheck, toPay: HandCoins, paid: CircleCheck, today: ReceiptIndianRupee, members: UserPlus, demand: FileSpreadsheet, rate: CircleCheck };
const KIND_ICON: Record<string, LucideIcon> = { loan: HandCoins, membership: UserPlus, deposit: PiggyBank, demandSheet: FileSpreadsheet, paymentReport: ReceiptIndianRupee, receipt: ReceiptIndianRupee };
const TONE_TEXT = { neutral: '', warning: 'text-warning-fg', danger: 'text-danger-fg', success: 'text-success-fg' } as const;

const SUBTITLE: Record<RoleDashboard['variant'], string> = {
  ADMIN: '',
  ACCOUNTANT: 'Your queue, this month’s demand sheets and the latest applications.',
  SIGNER: 'Everything waiting for your signature, oldest first.',
  CASHIER: 'Payouts to make, counter receipts and member-reported payments.',
  DDO: 'Your department only: validations, members and this month’s deduction.',
};

const DEMAND_LABEL: Record<DemandSheetStatus | 'NOT_GENERATED', string> = { NOT_GENERATED: 'Not generated', GENERATED: 'Generated', CERTIFIED: 'Certified', SENT_TO_DDO: 'Sent to DDO', RECOVERY_POSTED: 'Posted' };

function tileValue(t: RoleDashboard['tiles'][number]): string {
  if (t.format === 'money') return formatINRCompact(t.value);
  if (t.format === 'percent') return `${(t.value * 100).toFixed(1)}%`;
  return t.value.toLocaleString('en-IN');
}

function waitTone(days: number) {
  return days > 7 ? 'text-danger-fg' : days > 3 ? 'text-warning-fg' : 'text-fg-tertiary';
}

function Row({ icon: Icon, title, subtitle, right, onClick }: { icon: LucideIcon; title: ReactNode; subtitle: ReactNode; right?: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[36px_1fr_auto] items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-surface-subtle">
        <span className="flex size-9 items-center justify-center rounded-control bg-brand-subtle text-brand-text">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-label text-fg">{title}</span>
          <span className="block truncate text-caption text-fg-tertiary">{subtitle}</span>
        </span>
        <span className="text-right">{right}</span>
      </button>
    </li>
  );
}

function entityTag(entity: string, status?: string) {
  if (!status) return null;
  if (entity === 'loan') return <StatusTag entity="loan" status={status as LoanStatus} />;
  if (entity === 'membership') return <StatusTag entity="membership" status={status as MembershipStatus} />;
  if (entity === 'deposit') return <StatusTag entity="deposit" status={status as DepositStatus} />;
  return null;
}

export function RoleDashboardView({ d, summary }: { d: RoleDashboard; summary?: DashboardSummary }) {
  const navigate = useNavigate();
  const totalWaiting = d.queue.reduce((s, q) => s + q.count, 0);
  const maxQueue = Math.max(1, ...d.queue.map((q) => q.count));

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-body text-fg-secondary">{SUBTITLE[d.variant]}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.tiles.map((t) => {
          const Icon = TILE_ICON[t.key] ?? Inbox;
          const card = <StatCardV2 title={t.label} value={tileValue(t)} variant={StatCardV2Variant.NUMBER} titleIcon={<Icon size={16} />} subtitle={t.sub ?? ' '} />;
          return t.link ? (
            <button key={t.key} type="button" onClick={() => navigate(t.link!)} className={cn('h-full rounded-card text-left transition hover:-translate-y-0.5 focus-visible:outline-2 [&>*]:h-full', t.tone && TONE_TEXT[t.tone])} aria-label={`${t.label}: ${tileValue(t)}`}>
              {card}
            </button>
          ) : (
            <div key={t.key} className="h-full [&>*]:h-full">
              {card}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title={d.variant === 'SIGNER' ? 'Awaiting your signature' : d.variant === 'CASHIER' ? 'Waiting on you' : d.variant === 'DDO' ? 'Pending validations' : 'Your queue'}
            subtitle={totalWaiting ? `${totalWaiting} item${totalWaiting === 1 ? '' : 's'} · oldest first` : 'Nothing waiting'}
            action={<ButtonV2 text="Open work queue" buttonType={ButtonV2Type.PRIMARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} rightSlot={{ slot: <ArrowRight size={14} /> }} onClick={() => navigate('/queue')} />}
          >
            {d.oldest.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Illustration icon={CircleCheck} />
                <p className="text-label text-fg">You're all caught up</p>
                <p className="text-caption text-fg-tertiary">New work appears here as soon as it reaches your stage.</p>
              </div>
            ) : (
              <ul className="-my-1 flex flex-col divide-y divide-line-subtle">
                {d.oldest.map((i) => (
                  <Row
                    key={`${i.kind}-${i.id}`}
                    icon={KIND_ICON[i.kind] ?? Inbox}
                    title={
                      <span className="flex items-center gap-2">
                        {i.title}
                        <span className="text-caption text-fg-tertiary">· {i.stageLabel}</span>
                      </span>
                    }
                    subtitle={`${i.ref} · ${i.subtitle}${i.departmentName ? ` · ${i.departmentName}` : ''}`}
                    right={
                      <>
                        {i.amount ? <Money value={i.amount} className="block text-amount text-fg" /> : null}
                        <span className={cn('tabular text-caption', waitTone(i.days))}>{i.days === 0 ? 'Today' : `${i.days} day${i.days === 1 ? '' : 's'} waiting`}</span>
                      </>
                    }
                    onClick={() => navigate(i.link)}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="By stage" subtitle={d.done.count ? `${d.done.label}: ${d.done.count}${d.done.amount ? ` · ${formatINR(d.done.amount)}` : ''}` : d.done.label + ': none yet'}>
          {d.queue.length === 0 ? (
            <p className="py-6 text-center text-caption text-fg-tertiary">No stage has work for you.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {d.queue.map((q) => (
                <li key={q.key}>
                  <button type="button" className="flex w-full flex-col gap-1.5 text-left" onClick={() => navigate(q.link)}>
                    <span className="flex items-baseline justify-between text-caption">
                      <span className="text-label text-fg">{q.label}</span>
                      <span className="tabular text-fg">
                        {q.count}
                        {q.amount ? <span className="ml-2 text-fg-tertiary">{formatINRCompact(q.amount)}</span> : null}
                        <span className={cn('ml-2', waitTone(q.oldestDays))}>oldest {q.oldestDays}d</span>
                      </span>
                    </span>
                    <ProgressBarV2 value={(q.count / maxQueue) * 100} aria-label={`${q.label}: ${q.count}`} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {d.demand ? (
          <Panel
            title={`Demand sheets · ${formatCycle(d.demand.cycle)}`}
            subtitle={`${formatINR(d.demand.demand)} demand${d.demand.toPost ? ` · ${d.demand.toPost} waiting for recovery` : ''}`}
            action={<ButtonV2 text="Open" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} onClick={() => navigate(`/demand-sheets?cycle=${d.demand!.cycle}`)} />}
          >
            <ul className="flex flex-col gap-3">
              {d.demand.byStatus.map((s) => (
                <li key={s.status} className="flex items-center justify-between gap-3">
                  {s.status === 'NOT_GENERATED' ? <span className="text-body text-fg-secondary">{DEMAND_LABEL[s.status]}</span> : <StatusTag entity="demandSheet" status={s.status} />}
                  <span className={cn('tabular text-amount', s.count ? 'text-fg' : 'text-fg-tertiary')}>{s.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <div className={d.demand ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <Panel
            title={d.variant === 'CASHIER' ? 'Latest disbursements' : d.variant === 'SIGNER' ? 'Signed recently' : d.variant === 'DDO' ? 'From your department' : 'Latest applications'}
            subtitle={d.variant === 'SIGNER' ? 'Your signatures this month' : undefined}
          >
            {d.recent.length === 0 ? (
              <p className="py-6 text-center text-caption text-fg-tertiary">Nothing yet this month.</p>
            ) : (
              <ul className="-my-1 flex flex-col divide-y divide-line-subtle">
                {d.recent.map((r) => (
                  <Row
                    key={`${r.entity}-${r.id}`}
                    icon={KIND_ICON[r.entity] ?? Inbox}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {r.title} {entityTag(r.entity, r.status)}
                      </span>
                    }
                    subtitle={`${r.ref} · ${r.subtitle} · ${formatDisplayDate(r.at)}`}
                    right={r.amount ? <Money value={r.amount} className="text-amount text-fg" /> : null}
                    onClick={() => navigate(r.link)}
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {d.variant === 'DDO' && summary && summary.collectionsTrend.length > 0 ? (
        <Panel title="Your department's recovery" subtitle="Recovered vs demand, last 6 cycles">
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summary.collectionsTrend.map((t) => {
              const rate = t.demand ? t.recovered / t.demand : 0;
              return (
                <li key={t.cycle} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-caption">
                    <span className="text-fg-secondary">{formatCycle(t.cycle)}</span>
                    <span className="tabular text-fg">
                      {formatINRCompact(t.recovered)} <span className="text-fg-tertiary">/ {formatINRCompact(t.demand)}</span> <span className="text-caption-strong">{(rate * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                  <ProgressBarV2 value={rate * 100} aria-label={`${formatCycle(t.cycle)}: ${(rate * 100).toFixed(1)}% collected`} />
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
