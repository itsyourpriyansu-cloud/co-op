import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AlertV2, AlertV2SubType, AlertV2Type, AvatarV2, AvatarV2Size, Skeleton, Spinner, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { brand } from '@tgs/design-tokens';
import { ROLE_LABELS, type Persona } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { API_URL, api } from '@/lib/api';
import { Seal } from '@/components/Seal';

/** AU-01 Staff sign-in. Password sign-in waits for the real backend (Q-103); the prototype signs in by persona. */
export function LoginPage() {
  const { session, loginAsPersona } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const personas = useQuery({ queryKey: ['personas', 'console'], queryFn: () => api.demo.personas('console'), retry: false });

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
    <div className="flex min-h-full bg-canvas">
      {/* Brand panel */}
      <aside className="hidden w-[44%] max-w-[560px] flex-col justify-between bg-inverse p-10 text-fg-inverse lg:flex">
        <div className="flex items-center gap-3">
          <Seal size={56} />
          <span className="text-card-title">{brand.appName}</span>
        </div>
        <div>
          <p className="text-overline opacity-70">Admin Console</p>
          <h1 className="mt-2 text-display">Every loan, deposit and deduction in one place.</h1>
          <p className="mt-4 max-w-md text-body-lg opacity-80">Certify, review, sanction and disburse with a full audit trail, for every member of the society.</p>
        </div>
        <p className="text-caption opacity-60">
          {brand.legalName} · Regd. No. {brand.registrationNo}
        </p>
      </aside>

      {/* Sign-in panel */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl">
          <Seal size={64} className="mb-4 lg:hidden" />
          <h2 className="text-page-title text-fg">Sign in</h2>
          <p className="mt-1 text-body text-fg-secondary">This is a demo with fictional data. Choose a role to explore its workspace.</p>

          <div className="mt-6">
            {personas.isLoading && (
              <div className="flex flex-col gap-3" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} height={68} shape="rounded" />
                ))}
              </div>
            )}

            {personas.isError && (
              <AlertV2
                type={AlertV2Type.ERROR}
                subType={AlertV2SubType.SUBTLE}
                heading={`Can't reach the mock API at ${API_URL}`}
                description="Start everything with `npm run demo`, then try again."
                actions={{ primaryAction: { text: 'Try again', onClick: () => void personas.refetch() } }}
              />
            )}

            {personas.data && (
              <ul className="flex flex-col gap-2">
                {personas.data.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => signIn(p)}
                      disabled={pending !== null}
                      className="group flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-raised transition-colors hover:border-brand-border hover:bg-brand-subtle disabled:opacity-60"
                    >
                      <AvatarV2 fallbackText={p.name} size={AvatarV2Size.MD} alt={p.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-label text-fg">{p.name}</span>
                          <TagV2 text={ROLE_LABELS[p.role]} size={TagV2Size.XS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} color={TagV2Color.PRIMARY} />
                        </div>
                        <p className="truncate text-caption text-fg-tertiary">{p.story}</p>
                      </div>
                      {pending === p.id ? <Spinner size="sm" color="primary" /> : <ArrowRight size={18} className="text-fg-tertiary group-hover:text-brand-text" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="mt-4">
                <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't sign in" description={error} />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
