// ST-62 Permissions: what each role can open. Fixed by role in the prototype so segregation of
// duties (BR-019) cannot be switched off by accident.
import { Fragment } from 'react';
import { Check, Lock, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

export function PermissionsSection() {
  const q = useQuery({ queryKey: ['permissions'], queryFn: api.settings.permissions });
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
              <Lock size={14} aria-hidden /> Fixed by role
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
                            const yes = m.grants[r.role]?.includes(p.key);
                            return (
                              <td key={r.role} className="px-3 py-2.5 text-center">
                                {yes ? <Check size={16} className="inline text-success-fg" aria-label="Yes" /> : <Minus size={16} className="inline text-fg-disabled" aria-label="No" />}
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
