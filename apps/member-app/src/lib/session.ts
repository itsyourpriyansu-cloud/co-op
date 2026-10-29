// Session token in the device keystore (web preview: localStorage), cached in memory for fast requests.
import * as storage from './storage';
import type { Session } from '@tgs/types';

const KEY = 'tgs.app.session';
let cached: Session | null = null;
let unauthenticatedListener: (() => void) | null = null;

export function getCachedToken(): string | null {
  return cached?.token ?? null;
}

export function getCachedSession(): Session | null {
  return cached;
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await storage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveSession(session: Session): Promise<void> {
  cached = session;
  await storage.setItem(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  cached = null;
  await storage.removeItem(KEY).catch(() => undefined);
}

/** The auth provider registers here so a 401 from any request signs the user out. */
export function onUnauthenticated(listener: (() => void) | null): void {
  unauthenticatedListener = listener;
}

export function notifyUnauthenticated(): void {
  unauthenticatedListener?.();
}
