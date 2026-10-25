// Topbar content: search (M3), demo controls, theme, notifications, account menu with persona switch.
import { Bell, FlaskConical, LogOut, Moon, RotateCcw, Search, Sun, UserRoundCog, WifiOff } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  addSnackbarV2,
  AvatarV2,
  AvatarV2Size,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  MenuV2,
  MenuV2ItemActionType,
  MenuV2ItemVariant,
  SearchInputV2,
  SnackbarV2Variant,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  TooltipV2,
} from '@juspay/blend-design-system';
import { formatDisplayDate } from '@tgs/domain';
import { ROLE_LABELS } from '@tgs/types';
import { api } from '@/lib/api';
import { useAuth } from '../auth';
import { useThemeMode } from '../theme';

const icon = (Icon: typeof Bell) => ({ slot: <Icon size={16} strokeWidth={1.75} aria-hidden /> });

export function ConsoleTopbar() {
  const { session, logout, loginAsPersona } = useAuth();
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const demo = useQuery({ queryKey: ['demo-state'], queryFn: api.demo.state, refetchInterval: 30_000 });
  const personas = useQuery({ queryKey: ['personas', 'console'], queryFn: () => api.demo.personas('console') });
  const failing = (demo.data?.failureRate ?? 0) > 0;
  // ST-03 bell: unread notifications + open member questions (M9).
  const notifyCount = useQuery({ queryKey: ['notification-count'], queryFn: api.notifications.count, refetchInterval: 20_000, enabled: Boolean(session) });
  const bellCount = (notifyCount.data?.unread ?? 0) + (notifyCount.data?.openQuestions ?? 0);

  const switchTo = async (personaId: string) => {
    await loginAsPersona(personaId);
    await queryClient.invalidateQueries();
    navigate('/dashboard');
  };

  const reset = async () => {
    if (!window.confirm('Reset all demo data for every user and device?')) return;
    await api.demo.reset();
    await queryClient.invalidateQueries();
    addSnackbarV2({ header: 'Demo data reset', description: 'Everything is back to the original dataset.', variant: SnackbarV2Variant.SUCCESS });
  };

  const toggleFailures = async () => {
    await api.demo.setFailureRate(failing ? 0 : 0.1);
    await queryClient.invalidateQueries({ queryKey: ['demo-state'] });
  };

  return (
    <div className="flex w-full items-center gap-3">
      <div className="w-full max-w-md">
        <TooltipV2 content="Member and loan search arrives with the member master (M3)">
          <div>
            <SearchInputV2 value="" placeholder="Search members, loans, General No…" disabled leftSlot={<Search size={16} aria-hidden />} onChange={() => undefined} aria-label="Search" />
          </div>
        </TooltipV2>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <MenuV2
          trigger={
            <button type="button" className="flex items-center" aria-label="Demo controls">
              <TagV2
                text={demo.data ? `Demo · ${formatDisplayDate(demo.data.today)}` : 'Demo data'}
                type={TagV2Type.SUBTLE}
                subType={TagV2SubType.ROUNDED}
                color={failing ? TagV2Color.ERROR : TagV2Color.WARNING}
                size={TagV2Size.SM}
                leftSlot={{ slot: failing ? <WifiOff size={12} /> : <FlaskConical size={12} /> }}
              />
            </button>
          }
          items={[
            {
              label: 'Demo controls',
              items: [
                { label: { text: failing ? 'Stop simulating errors' : 'Simulate network errors (10%)', leftSlot: <WifiOff size={16} /> }, onClick: toggleFailures },
                { label: { text: 'Reset demo data', leftSlot: <RotateCcw size={16} /> }, variant: MenuV2ItemVariant.ACTION, actionType: MenuV2ItemActionType.DANGER, onClick: reset },
              ],
            },
          ]}
        />

        <ButtonV2
          buttonType={ButtonV2Type.SECONDARY}
          subType={ButtonV2SubType.ICON_ONLY}
          size={ButtonV2Size.SMALL}
          leftSlot={icon(mode === 'dark' ? Sun : Moon)}
          onClick={toggle}
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        />
        <div className="relative">
          <ButtonV2 buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.ICON_ONLY} size={ButtonV2Size.SMALL} leftSlot={icon(Bell)} aria-label={bellCount ? `Notifications, ${bellCount} new` : 'Notifications'} onClick={() => navigate(notifyCount.data?.unread || !notifyCount.data?.openQuestions ? '/notifications' : '/notifications?tab=questions')} />
          {bellCount > 0 && (
            <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger-solid px-1 text-[10px] font-semibold leading-none text-white" aria-hidden>
              {bellCount > 9 ? '9+' : bellCount}
            </span>
          )}
        </div>

        {session && (
          <MenuV2
            trigger={
              <button type="button" className="rounded-pill" aria-label="Account menu">
                <AvatarV2 fallbackText={session.user.name} size={AvatarV2Size.SM} alt={session.user.name} />
              </button>
            }
            items={[
              {
                label: `${session.user.name} · ${ROLE_LABELS[session.user.role]}`,
                items: [
                  {
                    label: { text: 'Switch demo persona', leftSlot: <UserRoundCog size={16} /> },
                    subMenu: (personas.data ?? []).map((p) => ({
                      label: { text: `${p.name} · ${ROLE_LABELS[p.role]}` },
                      selected: p.id === session.user.id,
                      onClick: () => void switchTo(p.id),
                    })),
                  },
                ],
              },
              {
                showSeparator: true,
                items: [
                  {
                    label: { text: 'Sign out', leftSlot: <LogOut size={16} /> },
                    variant: MenuV2ItemVariant.ACTION,
                    actionType: MenuV2ItemActionType.DANGER,
                    onClick: async () => {
                      await logout();
                      navigate('/login', { replace: true });
                    },
                  },
                ],
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
