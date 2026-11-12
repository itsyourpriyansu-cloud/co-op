// G1 (D-111): the audit log (docs/07 §7). Every change and sign-in, newest first, with who, when,
// from where and what changed. Read-only: the log can never be edited or deleted.
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2Type, TextInputV2 } from '@juspay/blend-design-system';
import { formatDisplayDateTime } from '@tgs/domain';
import type { AuditLogEntry } from '@tgs/types';
import { PageHeader } from '@/components/PageHeader';
import { SideDrawer } from '@/components/SideDrawer';
import { useDebounced } from '@/components/MemberSearch';
import { api } from '@/lib/api';

const PAGE = 50;

function Changed({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-caption-strong text-fg-secondary">{label}</p>
      <pre className="max-h-80 overflow-auto rounded-control border border-line-subtle bg-surface-subtle p-3 text-caption text-fg">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function AuditLogPage() {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string>();
  const needle = useDebounced(q.trim(), 300);
  const params = { ...(needle ? { q: needle } : {}), ...(entity ? { entity } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), page, pageSize: PAGE };
  const list = useQuery({ queryKey: ['audit', params], queryFn: () => api.audit.list(params), placeholderData: keepPreviousData });
  const one = useQuery({ queryKey: ['audit-entry', openId], queryFn: () => api.audit.get(openId!), enabled: Boolean(openId) });
  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Audit log" description="Every change and sign-in, newest first. Nothing here can be edited or deleted." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_160px_160px]">
        <TextInputV2 label="Search" placeholder="Name, record number or what happened" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-fg">Record type</span>
          <select className="h-10 rounded-control border border-line bg-surface px-3 text-body text-fg" value={entity} onChange={(e) => reset(() => setEntity(e.target.value))}>
            <option value="">All</option>
            {d?.entities.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <TextInputV2 label="From" type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
        <TextInputV2 label="To" type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
      </div>
      {list.isError ? (
        <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't load the audit log" description="Check your connection and try again." />
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full text-left text-body">
            <thead className="border-b border-line bg-surface-subtle text-caption-strong text-fg-secondary">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Who</th>
                <th className="px-4 py-2.5">What happened</th>
                <th className="px-4 py-2.5">Record</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {!d ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-caption text-fg-tertiary">
                    Loading…
                  </td>
                </tr>
              ) : d.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-caption text-fg-tertiary">
                    {needle || entity || from || to ? 'Nothing matches these filters.' : 'Nothing recorded yet.'}
                  </td>
                </tr>
              ) : (
                d.items.map((r: AuditLogEntry) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-surface-subtle" onClick={() => setOpenId(r.id)}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-caption text-fg-secondary tabular">{formatDisplayDateTime(r.at)}</td>
                    <td className="px-4 py-2.5 text-label text-fg">
                      {r.actorName ?? 'System'}
                      {r.actorRole && <span className="block text-caption text-fg-tertiary">{r.actorRole.replace('_', ' ').toLowerCase()}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-fg">
                      <button type="button" className="text-left hover:underline" onClick={() => setOpenId(r.id)}>
                        {r.summary}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-caption text-fg-secondary">
                      {r.entity}
                      {r.entityId && <span className="block tabular text-fg-tertiary">{r.entityId}</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {d && d.total > d.pageSize && (
            <footer className="flex items-center justify-between border-t border-line-subtle px-4 py-3 text-caption text-fg-secondary">
              <span>
                {d.total.toLocaleString('en-IN')} entries · page {page} of {pages}
              </span>
              <span className="flex gap-2">
                <ButtonV2 text="Newer" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} disabled={page <= 1} onClick={() => setPage(page - 1)} />
                <ButtonV2 text="Older" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} disabled={page >= pages} onClick={() => setPage(page + 1)} />
              </span>
            </footer>
          )}
        </section>
      )}
      <SideDrawer open={Boolean(openId)} onClose={() => setOpenId(undefined)} title={one.data?.summary ?? 'Audit entry'} description={one.data ? `${one.data.actorName ?? 'System'} · ${formatDisplayDateTime(one.data.at)}` : undefined}>
        {one.data ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-fg-secondary">Action</dt>
              <dd className="tabular">{one.data.action}</dd>
              <dt className="text-fg-secondary">Record</dt>
              <dd>
                {one.data.entity} {one.data.entityId}
              </dd>
              <dt className="text-fg-secondary">From</dt>
              <dd className="tabular">{one.data.ip ?? '—'}</dd>
            </dl>
            <Changed label="Before" value={one.data.before} />
            <Changed label="After" value={one.data.after} />
          </div>
        ) : (
          <p className="text-caption text-fg-tertiary">Loading…</p>
        )}
      </SideDrawer>
    </>
  );
}
