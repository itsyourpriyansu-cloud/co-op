// Console layout = Blend SidebarV2 (navigation, collapse with "/", mobile nav) + our topbar content.
import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { SidebarV2, type DirectoryData } from '@juspay/blend-design-system';
import { brand } from '@tgs/design-tokens';
import { ROLE_LABELS } from '@tgs/types';
import { NAV_GROUPS, navItemFor } from '@/config/navigation';
import { Seal } from '@/components/Seal';
import { useAuth } from '../auth';
import { ConsoleTopbar } from './ConsoleTopbar';
import { Initials } from '@/components/Initials';

export function ConsoleShell() {
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // a11y (D-064): most TabsV2 here are filters with no TabsV2Content, so Radix's aria-controls would
  // point at a panel that does not exist. Drop the dangling reference wherever it appears.
  useEffect(() => {
    const fix = () => {
      document.querySelectorAll('[role="tab"][aria-controls]').forEach((t) => !document.getElementById(t.getAttribute('aria-controls')!) && t.removeAttribute('aria-controls'));
      // Blend's scrolling main area must be reachable by keyboard (scrollable-region-focusable).
      document.querySelectorAll('[data-main-content="true"]:not([tabindex])').forEach((m) => m.setAttribute('tabindex', '0'));
      // DataTable's page-size select: its name must contain the number it shows (label-content-name-mismatch).
      document.querySelectorAll('[aria-label="Select number of rows per page"]').forEach((s) => s.setAttribute('aria-label', `${s.textContent?.trim() ?? ''} rows per page`));
    };
    fix();
    const mo = new MutationObserver(fix);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-controls', 'aria-label'] });
    return () => mo.disconnect();
  }, []);

  const data = useMemo<DirectoryData[]>(
    () =>
      NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items
          .filter((item) => can(item.permission))
          .map((item) => ({
            id: item.id,
            label: item.label,
            leftSlot: <item.icon size={18} strokeWidth={1.75} aria-hidden />,
            onClick: () => navigate(item.path),
            showOnMobile: true,
          })),
      })).filter((g) => (g.items?.length ?? 0) > 0),
    [can, navigate],
  );

  const brandBlock = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Seal size={36} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-label text-fg">{brand.appName}</div>
        <div className="truncate text-caption text-fg-tertiary">Admin Console</div>
      </div>
    </div>
  );

  const footer = session ? (
    <div className="flex min-w-0 items-center gap-2.5 px-1 py-1">
      <Initials name={session.user.name} size="sm" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-caption-strong text-fg">{session.user.name}</div>
        <div className="truncate text-caption text-fg-tertiary">{ROLE_LABELS[session.user.role]}</div>
      </div>
    </div>
  ) : null;

  return (
    <SidebarV2
      height="100vh"
      data={data}
      sidebarTopSlot={brandBlock}
      footer={footer}
      topbar={<ConsoleTopbar />}
      activeItem={navItemFor(pathname)?.id ?? null}
      sidebarCollapseKey="/"
    >
      <div className="mx-auto w-full max-w-[1440px] px-6 py-6">
        <Outlet />
      </div>
    </SidebarV2>
  );
}
