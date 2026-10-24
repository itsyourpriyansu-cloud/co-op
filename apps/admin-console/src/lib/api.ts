import { createApiClient } from '@tgs/api-client';
import { clearSession, getToken } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = createApiClient({
  baseUrl: API_URL,
  getToken,
  onUnauthenticated: () => {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  },
});
