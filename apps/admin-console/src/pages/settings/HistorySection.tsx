// ST-68 (lite): the latest settings and master changes with who made them.
import { History } from 'lucide-react';
import { formatDisplayDateTime } from '@tgs/domain';
import type { SettingsBundle } from '@tgs/types';
import { Illustration } from '@/components/ViewState';

const ENTITY: Record<string, string> = { settings: 'Settings', loanProduct: 'Loan product', society: 'Society', department: 'Department', user: 'User', template: 'Template' };

export function HistorySection({ bundle }: { bundle: SettingsBundle }) {
  if (!bundle.recentChanges.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface py-14 text-center shadow-raised">
        <Illustration icon={History} />
        <p className="text-label text-fg">No changes yet</p>
        <p className="max-w-sm text-caption text-fg-tertiary">Every saved change to settings, users, departments or templates appears here with the person and time.</p>
      </div>
    );
  return (
    <ul className="divide-y divide-line-subtle rounded-card border border-line bg-surface shadow-raised">
      {bundle.recentChanges.map((a) => (
        <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
          <div className="min-w-0">
            <p className="text-body text-fg">{a.summary}</p>
            <p className="text-caption text-fg-tertiary">
              {ENTITY[a.entity] ?? a.entity} · {a.actorName}
            </p>
          </div>
          <span className="tabular text-caption text-fg-tertiary">{formatDisplayDateTime(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}
