// Persists the console session in localStorage. Storage can throw (private mode, blocked
// site data), so every access is guarded and the app still works without it.
import type { Session } from '@tgs/types';

const KEY = 'tgs.console.session';
/** Set after a temporary password: the user must choose a new one before using the console (P1b). */
const MUST_CHANGE_KEY = 'tgs.console.mustChangePassword';

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
    localStorage.removeItem(MUST_CHANGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function getToken(): string | null {
  return loadSession()?.token ?? null;
}

export function loadMustChangePassword(): boolean {
  try {
    return localStorage.getItem(MUST_CHANGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMustChangePassword(value: boolean): void {
  try {
    if (value) localStorage.setItem(MUST_CHANGE_KEY, '1');
    else localStorage.removeItem(MUST_CHANGE_KEY);
  } catch {
    /* non-fatal */
  }
}
