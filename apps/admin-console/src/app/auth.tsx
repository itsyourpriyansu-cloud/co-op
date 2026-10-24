import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, Permission, Session } from '@tgs/types';
import { api } from '@/lib/api';
import { clearSession, loadSession, saveSession } from '@/lib/session';

interface AuthContextValue {
  session: Session | null;
  me: Me | undefined;
  isLoadingMe: boolean;
  can: (permission: Permission) => boolean;
  loginAsPersona: (personaId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => loadSession());

  // Permissions always come from the API (docs/03 §4), never from the client.
  const meQuery = useQuery({
    queryKey: ['me', session?.token],
    queryFn: api.me,
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const loginAsPersona = useCallback(
    async (personaId: string) => {
      const next = await api.auth.loginAsPersona(personaId, 'console');
      saveSession(next);
      setSession(next);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      me: meQuery.data,
      isLoadingMe: meQuery.isLoading,
      can: (permission) => meQuery.data?.permissions.includes(permission) ?? false,
      loginAsPersona,
      logout,
    }),
    [session, meQuery.data, meQuery.isLoading, loginAsPersona, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
