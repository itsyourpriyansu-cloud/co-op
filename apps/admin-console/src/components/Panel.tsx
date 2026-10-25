import type { ReactNode } from 'react';

/** Card with a title row (docs/19 §2). Used by dashboards and detail pages. */
export function Panel({ title, subtitle, action, children, flush }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="flex h-full flex-col rounded-card border border-line bg-surface shadow-raised">
      <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-card-title text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-caption text-fg-tertiary">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={flush ? 'flex-1' : 'flex-1 px-5 py-4'}>{children}</div>
    </section>
  );
}
