import { Landmark, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { NAV_GROUPS } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth';

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { can } = useAuth();

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Landmark className="size-5" aria-hidden />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">TGSECCSL</div>
            <div className="truncate text-xs text-muted">Admin Console</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (!items.length) return null;
          return (
            <div key={group.label} className="mb-5">
              {!collapsed && (
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary-subtle text-primary'
                            : 'text-text hover:bg-background',
                          collapsed && 'justify-center px-0',
                        )
                      }
                    >
                      <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted hover:bg-background"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="mx-auto size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && <p className="mt-2 px-2.5 text-[11px] text-muted">Regd. No. P-929</p>}
      </div>
    </aside>
  );
}
