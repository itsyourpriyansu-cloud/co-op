import { createApiClient } from '@tgs/api-client';
import { clearSession, getToken, loadSession, saveSession } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = createApiClient({
  baseUrl: API_URL,
  getToken,
  // Backend sessions (docs/22 §5.1): renew the 15-minute access token with the refresh token.
  // Mock API sessions have no refresh token, so this gives up and the user signs in again.
  refreshSession: async () => {
    const current = loadSession();
    if (!current?.refreshToken) return false;
    const next = await api.auth.refresh(current.refreshToken);
    saveSession(next);
    return true;
  },
  onUnauthenticated: () => {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  },
});
