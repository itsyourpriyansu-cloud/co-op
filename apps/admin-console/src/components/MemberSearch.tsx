// Member picker used by staff forms (ST-21 loans, ST-31 deposits): debounced server search,
// active members only, eligible sureties first.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, UserRound } from 'lucide-react';
import { TextInputV2 } from '@juspay/blend-design-system';
import type { MemberPick } from '@tgs/types';
import { api } from '@/lib/api';

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Search box + result list; picks one member. */
export function MemberSearch({ placeholder, onPick, exclude = [] }: { placeholder: string; onPick: (m: MemberPick) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const res = useQuery({ queryKey: ['member-search', dq], queryFn: () => api.loans.searchMembers(dq), enabled: dq.length >= 2 });
  const rows = (res.data ?? []).filter((m) => !exclude.includes(m.id));
  return (
    <div className="flex flex-col gap-2">
      <TextInputV2 value={q} placeholder={placeholder} leftSlot={{ slot: <Search size={16} className="text-fg-tertiary" /> }} onChange={(e) => setQ(e.target.value)} />
      {dq.length >= 2 && (
        <ul className="max-h-60 divide-y divide-line-subtle overflow-y-auto rounded-control border border-line">
          {res.isLoading && <li className="px-3 py-3 text-caption text-fg-tertiary">Searching…</li>}
          {!res.isLoading && !rows.length && <li className="px-3 py-3 text-caption text-fg-tertiary">No active member matches “{dq}”.</li>}
          {rows.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-subtle"
                onClick={() => {
                  onPick(m);
                  setQ('');
                }}
              >
                <UserRound size={16} className="shrink-0 text-fg-tertiary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label text-fg">
                    {m.name} <span className="tabular text-caption text-fg-tertiary">No. {m.generalNo}</span>
                  </span>
                  <span className="block truncate text-caption text-fg-tertiary">
                    {m.designation} · {m.departmentName} · {m.leftoverLabel} left{m.activeGuarantees ? ` · surety on ${m.activeGuarantees}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
