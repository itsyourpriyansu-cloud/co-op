import { createApiClient } from '@tgs/api-client';
import { getServerUrl } from './serverUrl';
import { getCachedSession, getCachedToken, notifyUnauthenticated, saveSession } from './session';

export const api = createApiClient({
  baseUrl: getServerUrl,
  getToken: getCachedToken,
  // Backend sessions (docs/22 §5.1): renew the short access token with the refresh token.
  // Mock API sessions have none, so this gives up and the member signs in again.
  refreshSession: async () => {
    const current = getCachedSession();
    if (!current?.refreshToken) return false;
    await saveSession(await api.auth.refresh(current.refreshToken));
    return true;
  },
  onUnauthenticated: notifyUnauthenticated,
  timeoutMs: 10_000,
});
