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
import { clearSession, getCachedSession, loadSession, onUnauthenticated, saveSession } from './session';

interface AuthContextValue {
  /** false until the stored session and server URL have been read from the device. */
  ready: boolean;
  session: Session | null;
  me: Me | undefined;
  loginAsPersona: (personaId: string) => Promise<Session>;
  /** MA-01 / MJ-02: finish a mobile sign-in or sign-up with the one-time code (D-067). */
  verifyOtp: (otpRef: string, otp: string, name?: string) => Promise<Session>;
  /** Use a session obtained elsewhere (e.g. applicant sign-up OTP, MJ-02). */
  adoptSession: (session: Session) => Promise<void>;
  /** Re-read the user from /me (an approved applicant becomes a member on the same login). */
  syncSession: () => Promise<Session | null>;
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
    queryKey: ['me', session?.user.id],
    queryFn: api.me,
    enabled: ready && !!session,
  });

  const loginAsPersona = useCallback(async (personaId: string) => {
    const next = await api.auth.loginAsPersona(personaId, 'app');
    await saveSession(next);
    setSession(next);
    return next;
  }, []);

  const verifyOtp = useCallback(
    async (otpRef: string, otp: string, name?: string) => {
      const next = await api.auth.otpVerify(otpRef, otp, name);
      await saveSession(next);
      setSession(next);
      queryClient.clear();
      return next;
    },
    [queryClient],
  );

  const adoptSession = useCallback(
    async (next: Session) => {
      await saveSession(next);
      setSession(next);
      queryClient.clear();
    },
    [queryClient],
  );

  const syncSession = useCallback(async () => {
    if (!session) return null;
    const me = await api.me();
    // Keep the current tokens (a refresh may have renewed them since the session was read).
    const next: Session = { ...(getCachedSession() ?? session), user: me.user };
    await saveSession(next);
    setSession(next);
    return next;
  }, [session]);

  const logout = useCallback(async () => {
    await api.auth.logout(getCachedSession()?.refreshToken).catch(() => undefined);
    await clearSession();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ ready, session, me: meQuery.data, loginAsPersona, verifyOtp, adoptSession, syncSession, logout }),
    [ready, session, meQuery.data, loginAsPersona, verifyOtp, adoptSession, syncSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
