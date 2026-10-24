// The state contract (docs/19 §3): every console screen renders through <ViewState>, so all ten
// states look the same everywhere and the State Explorer can show any of them on demand.
import type { ReactNode } from 'react';
import { CircleCheck, Lock, SearchX, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, EmptyState, Skeleton, Spinner } from '@juspay/blend-design-system';
import type { ViewState as ViewStateName } from '@tgs/types';

export type SkeletonLayout = 'table' | 'cards' | 'detail' | 'form' | 'stats';

export interface ViewStateProps {
  state: ViewStateName;
  layout?: SkeletonLayout;
  /** Empty = nothing exists yet. */
  empty?: { icon: LucideIcon; title: string; description?: string; action?: { label: string; onClick: () => void } };
  /** No results = filters hide everything. */
  onClearFilters?: () => void;
  onRetry?: () => void;
  /** Shown above content for `partial` and `success`. */
  notice?: string;
  children?: ReactNode;
}

export function Illustration({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'danger' | 'warning' | 'neutral' }) {
  const toneClass = {
    brand: 'bg-brand-subtle text-brand-text',
    danger: 'bg-danger-bg text-danger-fg',
    warning: 'bg-warning-bg text-warning-fg',
    neutral: 'bg-surface-muted text-fg-secondary',
  }[tone];
  return (
    <div className={`flex size-16 items-center justify-center rounded-pill ${toneClass}`}>
      <Icon className="size-8" strokeWidth={1.75} aria-hidden />
    </div>
  );
}

export function LoadingSkeleton({ layout = 'table' }: { layout?: SkeletonLayout }) {
  if (layout === 'stats')
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={116} shape="rounded" />
        ))}
      </div>
    );
  if (layout === 'cards')
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={148} shape="rounded" />
        ))}
      </div>
    );
  if (layout === 'detail' || layout === 'form')
    return (
      <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Skeleton height={28} width="40%" shape="rounded" />
          {Array.from({ length: layout === 'form' ? 6 : 4 }, (_, i) => (
            <Skeleton key={i} height={layout === 'form' ? 44 : 64} shape="rounded" />
          ))}
        </div>
        <Skeleton height={260} shape="rounded" />
      </div>
    );
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      <Skeleton height={40} shape="rounded" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} height={44} shape="rounded" />
      ))}
    </div>
  );
}

export function ViewState({ state, layout = 'table', empty, onClearFilters, onRetry, notice, children }: ViewStateProps) {
  switch (state) {
    case 'loading':
      return <LoadingSkeleton layout={layout} />;
    case 'empty':
      return (
        <EmptyState
          illustration={<Illustration icon={empty?.icon ?? SearchX} />}
          title={empty?.title ?? 'Nothing here yet'}
          description={empty?.description}
          primaryAction={empty?.action}
        />
      );
    case 'noResults':
      return (
        <EmptyState
          illustration={<Illustration icon={SearchX} tone="neutral" />}
          title="No matches for these filters"
          description="Try a different search, or clear the filters to see everything."
          primaryAction={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
        />
      );
    case 'error':
      return (
        <EmptyState
          illustration={<Illustration icon={TriangleAlert} tone="danger" />}
          title="We couldn't load this"
          description="Something went wrong on our side. Your data is safe. Try again in a moment."
          primaryAction={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}
        />
      );
    case 'offline':
      return (
        <EmptyState
          illustration={<Illustration icon={WifiOff} tone="warning" />}
          title="Can't reach the society server"
          description="Check your connection. We'll keep what you typed."
          primaryAction={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        />
      );
    case 'noAccess':
      return (
        <EmptyState
          illustration={<Illustration icon={Lock} tone="neutral" />}
          title="You don't have access to this"
          description="This area belongs to another role. Ask the Super Admin if you think you should have access."
        />
      );
    case 'partial':
      return (
        <div className="flex flex-col gap-4">
          <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Some information couldn't load" description={notice ?? 'Showing what we have. Missing parts will appear when they are available.'} />
          {children}
        </div>
      );
    case 'submitting':
      return (
        <div className="relative" aria-busy="true">
          <div className="pointer-events-none opacity-60">{children}</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner size="lg" color="primary" label="Saving…" />
          </div>
        </div>
      );
    case 'success':
      return (
        <div className="flex flex-col gap-4">
          <AlertV2 type={AlertV2Type.SUCCESS} subType={AlertV2SubType.SUBTLE} heading="Saved" description={notice ?? 'Your changes have been recorded.'} slot={{ slot: <CircleCheck className="size-4" /> }} />
          {children}
        </div>
      );
    case 'ready':
    default:
      return <>{children}</>;
  }
}
