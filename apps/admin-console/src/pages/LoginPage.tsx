import { useState } from 'react';
import { ArrowRight, Landmark, WifiOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { isApiError } from '@tgs/api-client';
import { ROLE_LABELS, type Persona } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API_URL, api } from '@/lib/api';
import { initials } from '@/lib/utils';

/** AU-01 Staff login. Password login waits for the real backend (Q-103); the prototype signs in by persona. */
export function LoginPage() {
  const { session, loginAsPersona } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personas = useQuery({
    queryKey: ['personas', 'console'],
    queryFn: () => api.demo.personas('console'),
    retry: false,
  });

  if (session) return <Navigate to="/dashboard" replace />;

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const signIn = async (persona: Persona) => {
    setPending(persona.id);
    setError(null);
    try {
      await loginAsPersona(persona.id);
      navigate(from, { replace: true });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Sign-in failed.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Landmark className="size-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            The Telangana Secretariat Employees Co-operative Credit Society Ltd. · Regd. No. P-929
          </p>
        </div>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Sign in as a demo user</h2>
              <p className="text-sm text-muted">
                Prototype with fictional data. Pick a role to explore its workspace.
              </p>
            </div>
          </div>

          {personas.isLoading && (
            <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-background" />
              ))}
            </div>
          )}

          {personas.isError && (
            <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
              <WifiOff className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              <div>
                <p className="font-medium">Can't reach the mock API at {API_URL}</p>
                <p className="mt-1 text-muted">
                  Start everything with{' '}
                  <code className="rounded bg-background px-1">npm run demo</code>, then retry.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => personas.refetch()}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {personas.data && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {personas.data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => signIn(p)}
                    disabled={pending !== null}
                    className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary-subtle disabled:opacity-60"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary group-hover:bg-surface">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs text-primary">{ROLE_LABELS[p.role]}</span>
                      </div>
                      <p className="truncate text-xs text-muted">{p.story}</p>
                    </div>
                    <ArrowRight
                      className="size-4 shrink-0 text-muted group-hover:text-primary"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
