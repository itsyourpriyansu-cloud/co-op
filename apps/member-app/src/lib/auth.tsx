import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, Session } from '@tgs/types';
import { api } from './api';
import { loadServerUrl } from './serverUrl';
import { clearSession, loadSession, onUnauthenticated, saveSession } from './session';

interface AuthContextValue {
  /** false until the stored session and server URL have been read from the device. */
  ready: boolean;
  session: Session | null;
  me: Me | undefined;
  loginAsPersona: (personaId: string) => Promise<Session>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadServerUrl(), loadSession()]).then(([, stored]) => {
      if (!alive) return;
      setSession(stored);
      setReady(true);
    });
    onUnauthenticated(() => {
      void clearSession();
      setSession(null);
      queryClient.clear();
    });
    return () => {
      alive = false;
      onUnauthenticated(null);
    };
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ['me', session?.token],
    queryFn: api.me,
    enabled: ready && !!session,
  });

  const loginAsPersona = useCallback(async (personaId: string) => {
    const next = await api.auth.loginAsPersona(personaId, 'app');
    await saveSession(next);
    setSession(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    await clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ ready, session, me: meQuery.data, loginAsPersona, logout }),
    [ready, session, meQuery.data, loginAsPersona, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
