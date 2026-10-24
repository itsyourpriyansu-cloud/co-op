import { createApiClient } from '@tgs/api-client';
import { getServerUrl } from './serverUrl';
import { getCachedToken, notifyUnauthenticated } from './session';

export const api = createApiClient({
  baseUrl: getServerUrl,
  getToken: getCachedToken,
  onUnauthenticated: notifyUnauthenticated,
  timeoutMs: 10_000,
});
