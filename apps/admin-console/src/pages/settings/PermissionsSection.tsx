// ST-62 Permissions: what each role can open. Only the Super Admin changes it (D-134); changing
// settings, users and permissions stays with the Super Admin, so those boxes are locked.
import { Fragment } from 'react';
import { Check, Lock, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SUPER_ADMIN_ONLY } from '@tgs/domain';
import type { ConsoleRole, Permission } from '@tgs/types';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

/** A box nobody can change: admin-only rights, and the Super Admin's hold on the settings. */
const locked = (role: ConsoleRole, p: Permission) => SUPER_ADMIN_ONLY.includes(p) || (role === 'SUPER_ADMIN' && p === 'settings.view');

export function PermissionsSection({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({ queryKey: ['permissions'], queryFn: api.settings.permissions });
  const save = useSettingsSave((x: { role: ConsoleRole; permissions: Permission[] }) => api.settings.updatePermissions(x.role, x.permissions), 'Permissions saved', ['permissions', 'me']);
  const m = q.data;
  const groups = m ? [...new Set(m.permissions.map((p) => p.group))] : [];
  return (
    <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="table" onRetry={() => void q.refetch()}>
      {m && (
        <section className="rounded-card border border-line bg-surface shadow-raised">
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle px-5 py-4">
            <div>
              <h2 className="text-card-title text-fg">Role access</h2>
              <p className="mt-0.5 max-w-2xl text-caption text-fg-tertiary">Approvals are also limited by stage: each person can only act on the step that belongs to their role, and the President must be a different person from the Secretary.</p>
            </div>
            <span className="inline-flex items-center gap-1 text-caption text-fg-tertiary">
              <Lock size={14} aria-hidden /> {canEdit ? 'Click a box to change it. Locked boxes stay with the Super Admin.' : 'Only the Super Admin can change these'}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line-subtle">
                  <th className="px-5 py-3 text-overline uppercase tracking-wide text-fg-tertiary">Can open</th>
                  {m.roles.map((r) => (
                    <th key={r.role} className="px-3 py-3 text-center text-caption-strong text-fg">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g}>
                    <tr>
                      <td colSpan={m.roles.length + 1} className="bg-surface-subtle px-5 py-1.5 text-overline uppercase tracking-wide text-fg-tertiary">
                        {g}
                      </td>
                    </tr>
                    {m.permissions
                      .filter((p) => p.group === g)
                      .map((p) => (
                        <tr key={p.key} className="border-b border-line-subtle last:border-0">
                          <td className="px-5 py-2.5 text-body text-fg">{p.label}</td>
                          {m.roles.map((r) => {
                            const role = r.role as ConsoleRole;
                            const yes = Boolean(m.grants[role]?.includes(p.key));
                            const mark = yes ? <Check size={16} className="inline text-success-fg" aria-hidden /> : <Minus size={16} className="inline text-fg-disabled" aria-hidden />;
                            const fixed = locked(role, p.key);
                            return (
                              <td key={r.role} className="px-3 py-2.5 text-center">
                                {canEdit && !fixed ? (
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={yes}
                                    aria-label={`${r.label}: ${p.label}`}
                                    disabled={save.isPending}
                                    onClick={() => save.mutate({ role, permissions: yes ? m.grants[role]!.filter((x) => x !== p.key) : [...(m.grants[role] ?? []), p.key] })}
                                    className="rounded-control p-1 hover:bg-surface-subtle disabled:opacity-50"
                                  >
                                    {mark}
                                  </button>
                                ) : (
                                  <span role="img" aria-label={`${r.label}: ${p.label}: ${yes ? 'yes' : 'no'}${canEdit ? ' (locked)' : ''}`}>{mark}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ViewState>
  );
}
