import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me, Permission, Session, StaffLoginResult } from '@tgs/types';
import { api } from '@/lib/api';
import { clearSession, loadMustChangePassword, loadSession, saveMustChangePassword, saveSession } from '@/lib/session';

interface AuthContextValue {
  session: Session | null;
  me: Me | undefined;
  isLoadingMe: boolean;
  /** /me failed (server unreachable): show an error with Retry, not "no access" (M10). */
  meError: boolean;
  retryMe: () => void;
  can: (permission: Permission) => boolean;
  loginAsPersona: (personaId: string) => Promise<void>;
  /** AU-01 (backend): user ID + password. Returns the next step for signers (authenticator). */
  loginWithPassword: (username: string, password: string) => Promise<StaffLoginResult>;
  /** Finishes a sign-in that needed an authenticator code. */
  completeSignIn: (session: Session, mustChangePassword?: boolean) => Promise<void>;
  /** Signed in with a temporary password: must choose a new one first. */
  mustChangePassword: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [mustChangePassword, setMustChange] = useState(() => loadMustChangePassword());

  // Permissions always come from the API (docs/03 §4), never from the client.
  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: api.me,
    enabled: !!session && !mustChangePassword,
    staleTime: 5 * 60_000,
  });

  const begin = useCallback(
    async (next: Session, mustChange = false) => {
      saveSession(next);
      saveMustChangePassword(mustChange);
      setMustChange(mustChange);
      setSession(next);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    [queryClient],
  );

  const loginAsPersona = useCallback(
    async (personaId: string) => {
      await begin(await api.auth.loginAsPersona(personaId, 'console'));
    },
    [begin],
  );

  const loginWithPassword = useCallback(
    async (username: string, password: string) => {
      const result = await api.auth.staffLogin(username, password);
      if (result.status === 'OK') await begin(result.session, result.mustChangePassword);
      return result;
    },
    [begin],
  );

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api.auth.changeStaffPassword(currentPassword, newPassword);
    saveMustChangePassword(false);
    setMustChange(false);
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout(loadSession()?.refreshToken).catch(() => undefined);
    clearSession();
    setMustChange(false);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      me: meQuery.data,
      isLoadingMe: meQuery.isLoading,
      meError: meQuery.isError && !meQuery.data,
      retryMe: () => void meQuery.refetch(),
      can: (permission) => meQuery.data?.permissions.includes(permission) ?? false,
      loginAsPersona,
      loginWithPassword,
      completeSignIn: (next, mustChange) => begin(next, mustChange),
      mustChangePassword,
      changePassword,
      logout,
    }),
    [session, meQuery, loginAsPersona, loginWithPassword, begin, mustChangePassword, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
