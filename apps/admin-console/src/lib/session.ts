// Persists the console session in localStorage. Storage can throw (private mode, blocked
// site data), so every access is guarded and the app still works without it.
import type { Session } from '@tgs/types';

const KEY = 'tgs.console.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* non-fatal */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}

export function getToken(): string | null {
  return loadSession()?.token ?? null;
}
