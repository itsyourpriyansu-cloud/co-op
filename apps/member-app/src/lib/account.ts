// M8 member account data: home snapshot, notifications, preferences, support (server is authoritative).
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate } from '@tgs/domain';
import { api } from './api';

export const accountKeys = {
  home: ['me', 'home'] as const,
  notifications: ['me', 'notifications'] as const,
  preferences: ['me', 'preferences'] as const,
  support: ['me', 'support'] as const,
};

export const useHome = () => useQuery({ queryKey: accountKeys.home, queryFn: api.account.home, refetchInterval: 20_000 });
export const useNotifications = () => useQuery({ queryKey: accountKeys.notifications, queryFn: api.account.notifications, refetchInterval: 20_000 });
export const usePreferences = () => useQuery({ queryKey: accountKeys.preferences, queryFn: api.account.preferences });
export const useSupport = () => useQuery({ queryKey: accountKeys.support, queryFn: api.account.support });

/** Notification links are app routes; only the ones the member app has are followed. */
export function appRouteFor(link?: string): string | undefined {
  if (!link) return undefined;
  return /^\/(loan\/|deposit\/|payment\/|payments$|surety$|deposits$|loans$|profile)/.test(link) ? link : undefined;
}

/** "12 Oct 2026 · 10:42" (dates follow the demo clock, so no "x days ago"). */
export function stamp(iso: string): string {
  return `${formatDisplayDate(iso.slice(0, 10))} · ${new Date(iso).toTimeString().slice(0, 5)}`;
}
