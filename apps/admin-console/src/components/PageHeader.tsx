import type { ReactNode } from 'react';

/** One per page (docs/19 §2): title (pageTitle role), optional description, status and actions. */
export function PageHeader({ title, description, meta, actions }: { title: string; description?: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page-title text-fg">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-3xl text-body text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section heading inside a page. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-section-title text-fg">{children}</h2>
      {action}
    </div>
  );
}
