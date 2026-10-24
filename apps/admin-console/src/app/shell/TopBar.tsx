import { useEffect, useRef, useState } from 'react';
import { CalendarDays, FlaskConical, LogOut, RotateCcw, Search, WifiOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { formatDisplayDate } from '@tgs/domain';
import { ROLE_LABELS } from '@tgs/types';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { initials } from '@/lib/utils';
import { useAuth } from '../auth';

export function TopBar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      {/* Command palette arrives with the member master (M3). */}
      <div className="relative w-full max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          disabled
          placeholder="Search members, loans, General No…"
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-16 text-sm placeholder:text-muted disabled:cursor-not-allowed"
          aria-label="Search (available from M3)"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 text-[11px] text-muted">
          Ctrl K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DemoMenu />
        {session && (
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
              {initials(session.user.name)}
            </div>
            <div className="hidden leading-tight md:block">
              <div className="text-sm font-medium">{session.user.name}</div>
              <div className="text-xs text-muted">{ROLE_LABELS[session.user.role]}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Demo controls (docs/07 §6): demo date, simulated errors, reset. Prototype only. */
function DemoMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const demo = useQuery({
    queryKey: ['demo-state'],
    queryFn: api.demo.state,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const failing = (demo.data?.failureRate ?? 0) > 0;

  const toggleFailures = async () => {
    await api.demo.setFailureRate(failing ? 0 : 0.1);
    await queryClient.invalidateQueries({ queryKey: ['demo-state'] });
  };

  const reset = async () => {
    if (!window.confirm('Reset all demo data for every user and device?')) return;
    await api.demo.reset();
    await queryClient.invalidateQueries();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-xs font-medium"
        aria-expanded={open}
      >
        <FlaskConical className="size-3.5" aria-hidden />
        Demo data
        {demo.data && <span className="text-muted">· {formatDisplayDate(demo.data.today)}</span>}
        {failing && <WifiOff className="size-3.5 text-danger" aria-label="Simulated errors on" />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
            <CalendarDays className="size-4" aria-hidden />
            Demo date {demo.data ? formatDisplayDate(demo.data.today) : '…'}
          </div>
          <button
            type="button"
            onClick={toggleFailures}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-background"
          >
            <WifiOff className="size-4" aria-hidden />
            {failing ? 'Stop simulating network errors' : 'Simulate network errors (10%)'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-danger hover:bg-background"
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset demo data
          </button>
        </div>
      )}
    </div>
  );
}
