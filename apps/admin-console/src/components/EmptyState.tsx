import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Every list/page has a designed empty state (docs/04 §6). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
