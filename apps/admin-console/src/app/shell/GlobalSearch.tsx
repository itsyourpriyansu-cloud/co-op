// Topbar global search (docs/04 §3, D-064): members by name / General No. / Employee ID / mobile,
// loans and deposits by number, joining applications, receipts. Ctrl/⌘ K focuses it; arrows + Enter
// open a hit; Escape closes. Results are scoped server-side (DDO = own department).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, HandCoins, PiggyBank, ReceiptIndianRupee, Search, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { SearchInputV2 } from '@juspay/blend-design-system';
import type { SearchHit } from '@tgs/types';
import { useDebounced } from '@/components/MemberSearch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const KIND: Record<SearchHit['kind'], { label: string; icon: LucideIcon }> = {
  member: { label: 'Members', icon: Users },
  loan: { label: 'Loans', icon: HandCoins },
  deposit: { label: 'Deposits', icon: PiggyBank },
  application: { label: 'Joining', icon: UserPlus },
  receipt: { label: 'Receipts', icon: ReceiptIndianRupee },
};
const STATUS = (s?: string) => (s ? s.toLowerCase().replace(/_/g, ' ') : '');

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 250);
  const res = useQuery({ queryKey: ['global-search', dq], queryFn: () => api.search(dq), enabled: dq.length >= 2 });
  const hits = useMemo(() => res.data ?? [], [res.data]);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => setActive(0), [dq]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        wrap.current?.querySelector('input')?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    navigate(h.link);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (!hits.length) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => (a + 1) % hits.length));
    if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => (a - 1 + hits.length) % hits.length));
    if (e.key === 'Enter') (e.preventDefault(), go(hits[active]!));
  };

  const groups = (Object.keys(KIND) as SearchHit['kind'][]).map((k) => ({ k, items: hits.filter((h) => h.kind === k) })).filter((g) => g.items.length);
  const show = open && dq.length >= 2;

  return (
    <div
      ref={wrap}
      className="relative w-full"
      onKeyDown={onKeyDown}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <SearchInputV2 value={q} placeholder="Search members, loans, FDs, receipts…  (Ctrl K)" leftSlot={<Search size={16} aria-hidden />} onChange={(e) => (setQ(e.target.value), setOpen(true))} aria-label="Search members, loans, deposits and receipts" aria-expanded={show} aria-controls={listId} />
      {show && (
        <div id={listId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-raised">
          {res.isLoading ? (
            <p className="px-3 py-4 text-caption text-fg-tertiary">Searching…</p>
          ) : !hits.length ? (
            <p className="px-3 py-4 text-caption text-fg-tertiary">No matches for “{dq}”. Try a General No., Employee ID, loan or FDR number.</p>
          ) : (
            groups.map((g) => {
              const K = KIND[g.k];
              return (
                <div key={g.k} className="py-1">
                  <p className="px-3 pb-1 pt-2 text-overline uppercase tracking-wide text-fg-tertiary">{K.label}</p>
                  {g.items.map((h) => {
                    const i = hits.indexOf(h);
                    return (
                      <button
                        key={`${h.kind}-${h.id}`}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={cn('flex w-full items-center gap-3 rounded-control px-3 py-2 text-left', i === active ? 'bg-brand-subtle' : 'hover:bg-surface-subtle')}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-subtle text-fg-secondary">{h.kind === 'receipt' ? <FileText size={16} aria-hidden /> : <K.icon size={16} aria-hidden />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label text-fg">{h.title}</span>
                          <span className="block truncate text-caption text-fg-tertiary">{h.subtitle}</span>
                        </span>
                        {h.status && <span className="shrink-0 text-caption capitalize text-fg-tertiary">{STATUS(h.status)}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
