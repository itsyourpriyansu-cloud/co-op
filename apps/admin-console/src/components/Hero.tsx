import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';

/**
 * D-150: a page's top summary, as on the phone (D-139 `HeroCard`): navy lit by a gold glow, with frosted
 * `GlassStat` tiles on it. Styles live in index.css (`.tgs-hero`, `.tgs-glass`).
 */
export function HeroCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="tgs-hero rounded-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

interface GlassStatProps {
  icon: LucideIcon;
  title: string;
  value: string;
  subtitle?: string;
  change?: { text: string; up: boolean };
  /** Opens the list behind the number. */
  onClick?: () => void;
  /** Status of the figure, shown as a dot by the title (status colours carry meaning only). */
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}

const DOT = { neutral: '', warning: 'bg-warning-solid', danger: 'bg-danger-solid', success: 'bg-success-solid' } as const;

/** One figure on the hero: label, value, one line of context, optional change against last time. */
export function GlassStat({ icon: Icon, title, value, subtitle, change, onClick, tone }: GlassStatProps) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-caption-strong tgs-on-muted">
        <span className="flex size-7 items-center justify-center rounded-sm bg-[var(--tgs-hero-glass-hover)] text-gold">
          <Icon size={16} strokeWidth={1.75} aria-hidden />
        </span>
        {title}
        {tone && DOT[tone] && <span className={`ml-auto size-2 rounded-pill ring-2 ring-[var(--tgs-hero-glass-border)] ${DOT[tone]}`} aria-hidden />}
      </span>
      <span className="mt-3 block text-metric tabular text-[var(--tgs-hero-on)]">{value}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-caption tgs-on-muted">
        {change && (
          <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--tgs-hero-on)]">
            {change.up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
            {change.text}
          </span>
        )}
        {subtitle}
      </span>
    </>
  );
  const cls = 'tgs-glass flex h-full flex-col rounded-control p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
