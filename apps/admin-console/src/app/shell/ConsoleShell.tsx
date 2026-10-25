// Console layout = Blend SidebarV2 (navigation, collapse with "/", mobile nav) + our topbar content.
import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AvatarV2, AvatarV2Size, SidebarV2, type DirectoryData } from '@juspay/blend-design-system';
import { brand } from '@tgs/design-tokens';
import { ROLE_LABELS } from '@tgs/types';
import { NAV_GROUPS, navItemFor } from '@/config/navigation';
import { Seal } from '@/components/Seal';
import { useAuth } from '../auth';
import { ConsoleTopbar } from './ConsoleTopbar';

export function ConsoleShell() {
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
      <AvatarV2 fallbackText={session.user.name} size={AvatarV2Size.SM} alt={session.user.name} />
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
      <main className="mx-auto w-full max-w-[1440px] px-6 py-6">
        <Outlet />
      </main>
    </SidebarV2>
  );
}
