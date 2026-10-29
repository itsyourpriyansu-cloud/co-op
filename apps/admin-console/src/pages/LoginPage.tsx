import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type, Skeleton, Spinner, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, TextInputV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { checkPassword } from '@tgs/domain';
import { brand } from '@tgs/design-tokens';
import { ROLE_LABELS, type Persona, type TotpSetup } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { API_URL, api } from '@/lib/api';
import { Seal } from '@/components/Seal';
import { Initials } from '@/components/Initials';

type Step =
  | { kind: 'password' }
  | { kind: 'totp'; challengeToken: string; mustChangePassword: boolean }
  | { kind: 'setup'; challengeToken: string; mustChangePassword: boolean; setup?: TotpSetup }
  | { kind: 'change' };

type FieldErrors = Record<string, string>;
const errorOf = (e: unknown) => (isApiError(e) ? e.message : 'Sign-in failed. Try again.');
const fieldErrorsOf = (e: unknown): FieldErrors => (isApiError(e) ? (e.fieldErrors ?? {}) : {});
const show = (errors: FieldErrors, key: string) => (errors[key] ? { show: true, message: errors[key] } : undefined);

/**
 * AU-01 Staff sign-in. Against the backend (docs/22 §5.1): user ID + password, then an
 * authenticator code for the Super Admin, Secretary and President (set up by QR code the first
 * time), and a new password after a temporary one. Demo personas show whenever the server offers them.
 */
export function LoginPage() {
  const { session, mustChangePassword, loginAsPersona, loginWithPassword, completeSignIn, changePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false, staleTime: 60_000 });
  const personas = useQuery({ queryKey: ['personas', 'console'], queryFn: () => api.demo.personas('console'), retry: false });
  const isBackend = health.data?.service === 'tgseccsl-backend';

  const [step, setStep] = useState<Step>(() => (mustChangePassword ? { kind: 'change' } : { kind: 'password' }));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (session && !mustChangePassword) return <Navigate to={from} replace />;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setFieldErrors({});
    try {
      await work();
    } catch (e) {
      setError(errorOf(e));
      setFieldErrors(fieldErrorsOf(e));
    } finally {
      setBusy(null);
    }
  };

  const restart = () => {
    setStep({ kind: 'password' });
    setCode('');
    setError(null);
    setFieldErrors({});
  };

  const submitPassword = (e?: FormEvent) => {
    e?.preventDefault();
    void run('password', async () => {
      const result = await loginWithPassword(username, password);
      const { mustChangePassword: mustChange } = result;
      if (result.status === 'TOTP_REQUIRED') setStep({ kind: 'totp', challengeToken: result.challengeToken, mustChangePassword: mustChange });
      else if (result.status === 'TOTP_SETUP_REQUIRED') setStep({ kind: 'setup', challengeToken: result.challengeToken, mustChangePassword: mustChange, setup: await api.auth.totpSetup(result.challengeToken) });
      else if (result.mustChangePassword) setStep({ kind: 'change' });
      else navigate(from, { replace: true });
    });
  };

  const submitCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (step.kind !== 'totp' && step.kind !== 'setup') return;
    void run('code', async () => {
      const next = step.kind === 'totp' ? await api.auth.totpVerify(step.challengeToken, code.trim()) : await api.auth.totpConfirm(step.challengeToken, code.trim());
      await completeSignIn(next, step.mustChangePassword);
      setCode('');
      // A temporary password is replaced right after the authenticator step.
      if (step.mustChangePassword) setStep({ kind: 'change' });
      else navigate(from, { replace: true });
    });
  };

  const newPasswordCheck = checkPassword(newPassword, { employeeId: session?.user.id });
  const submitNewPassword = (e?: FormEvent) => {
    e?.preventDefault();
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'The two passwords do not match.' });
      return;
    }
    void run('change', async () => {
      await changePassword(password, newPassword);
      navigate(from, { replace: true });
    });
  };

  const signInAsPersona = (persona: Persona) =>
    void run(persona.id, async () => {
      await loginAsPersona(persona.id);
      navigate(from, { replace: true });
    });

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

          {step.kind === 'password' && (
            <>
              <h2 className="text-page-title text-fg">Sign in</h2>
              <p className="mt-1 text-body text-fg-secondary">
                {isBackend ? 'Use the user ID and password the Super Admin gave you.' : 'This is a demo with fictional data. Choose a role to explore its workspace.'}
              </p>

              {health.isLoading && (
                <div className="mt-6" aria-busy="true">
                  <Skeleton height={180} shape="rounded" />
                </div>
              )}

              {health.isError && (
                <div className="mt-6">
                  <AlertV2
                    type={AlertV2Type.ERROR}
                    subType={AlertV2SubType.SUBTLE}
                    heading={`Can't reach the society server at ${API_URL}`}
                    description="Start it with `npm run demo` (demo) or `npm run demo:backend`, then try again."
                    actions={{ primaryAction: { text: 'Try again', onClick: () => void Promise.all([health.refetch(), personas.refetch()]) } }}
                  />
                </div>
              )}

              {isBackend && (
                <form className="mt-6 flex flex-col gap-4" onSubmit={submitPassword} noValidate>
                  <TextInputV2 label="User ID" value={username} autoComplete="username" required onChange={(e) => setUsername(e.target.value)} error={show(fieldErrors, 'username')} />
                  <TextInputV2 label="Password" type="password" value={password} autoComplete="current-password" required onChange={(e) => setPassword(e.target.value)} error={show(fieldErrors, 'password')} />
                  <ButtonV2 text="Sign in" buttonType={ButtonV2Type.PRIMARY} width="100%" type="submit" loading={busy === 'password'} disabled={!username.trim() || !password || busy !== null} />
                </form>
              )}

              {error && step.kind === 'password' && busy === null && (
                <div className="mt-4">
                  <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't sign in" description={error} />
                </div>
              )}

              {personas.data && personas.data.length > 0 && (
                <div className="mt-8">
                  {isBackend && (
                    <div className="mb-3">
                      <h3 className="text-label text-fg">Demo sign-in</h3>
                      <p className="text-caption text-fg-secondary">Fictional data only. Not available on the live server.</p>
                    </div>
                  )}
                  {personas.isLoading && (
                    <div className="flex flex-col gap-3" aria-busy="true">
                      {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} height={68} shape="rounded" />
                      ))}
                    </div>
                  )}
                  <ul className="flex flex-col gap-2">
                    {personas.data.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => signInAsPersona(p)}
                          disabled={busy !== null}
                          className="group flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-raised transition-colors hover:border-brand-border hover:bg-brand-subtle disabled:opacity-60"
                        >
                          <Initials name={p.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-label text-fg">{p.name}</span>
                              <TagV2 text={ROLE_LABELS[p.role]} size={TagV2Size.XS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} color={TagV2Color.PRIMARY} />
                            </div>
                            <p className="truncate text-caption text-fg-tertiary">{p.story}</p>
                          </div>
                          {busy === p.id ? <Spinner size="sm" color="primary" /> : <ArrowRight size={18} className="text-fg-tertiary group-hover:text-brand-text" aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {step.kind === 'totp' && (
            <StepCard icon={<ShieldCheck size={22} aria-hidden />} title="Enter your authenticator code" lead="Open the authenticator app on your phone and type the 6-digit code shown for TGSECCSL." onBack={restart}>
              <form className="flex flex-col gap-4" onSubmit={submitCode} noValidate>
                <CodeInput value={code} onChange={setCode} error={fieldErrors.code} />
                <ButtonV2 text="Verify and sign in" buttonType={ButtonV2Type.PRIMARY} width="100%" type="submit" loading={busy === 'code'} disabled={code.trim().length !== 6 || busy !== null} />
              </form>
              {error && <StepError message={error} />}
            </StepCard>
          )}

          {step.kind === 'setup' && (
            <StepCard
              icon={<ShieldCheck size={22} aria-hidden />}
              title="Set up an authenticator app"
              lead="Your role signs approvals, so the society asks for a second step. Use Google Authenticator, Microsoft Authenticator or any TOTP app."
              onBack={restart}
            >
              <ol className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-body text-fg-secondary">
                <li>In the app, choose to add an account and scan this QR code.</li>
                <li>Type the 6-digit code it shows below.</li>
              </ol>
              {step.setup ? (
                <div className="mb-4 flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-4">
                  <img src={step.setup.qrDataUrl} width={160} height={160} alt="QR code to add TGSECCSL to an authenticator app" className="rounded bg-white p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-fg-secondary">Can't scan? Type this key instead:</p>
                    <p className="mt-1 select-all break-all font-mono text-body text-fg">{step.setup.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
                  </div>
                </div>
              ) : (
                <Skeleton height={190} shape="rounded" />
              )}
              <form className="flex flex-col gap-4" onSubmit={submitCode} noValidate>
                <CodeInput value={code} onChange={setCode} error={fieldErrors.code} />
                <ButtonV2 text="Confirm and sign in" buttonType={ButtonV2Type.PRIMARY} width="100%" type="submit" loading={busy === 'code'} disabled={code.trim().length !== 6 || busy !== null} />
              </form>
              {error && <StepError message={error} />}
            </StepCard>
          )}

          {step.kind === 'change' && (
            <StepCard icon={<KeyRound size={22} aria-hidden />} title="Choose a new password" lead="You signed in with a temporary password. Choose your own before you continue.">
              <form className="flex flex-col gap-4" onSubmit={submitNewPassword} noValidate>
                <TextInputV2 label="Temporary password" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} error={show(fieldErrors, 'currentPassword')} />
                <TextInputV2 label="New password" type="password" value={newPassword} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} error={show(fieldErrors, 'newPassword')} />
                <ul className="flex flex-col gap-1" aria-label="Password rules">
                  {newPasswordCheck.checks.map((c) => (
                    <li key={c.ruleId} className={`text-caption ${newPassword && c.pass ? 'text-success-text' : 'text-fg-secondary'}`}>
                      {newPassword && c.pass ? '✓ ' : '• '}
                      {c.message}
                    </li>
                  ))}
                </ul>
                <TextInputV2 label="Type the new password again" type="password" value={confirmPassword} autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} error={show(fieldErrors, 'confirmPassword')} />
                <ButtonV2 text="Save and continue" buttonType={ButtonV2Type.PRIMARY} width="100%" type="submit" loading={busy === 'change'} disabled={!password || !newPasswordCheck.ok || !confirmPassword || busy !== null} />
              </form>
              {error && <StepError message={error} />}
            </StepCard>
          )}
        </div>
      </section>
    </div>
  );
}

function StepCard({ icon, title, lead, onBack, children }: { icon: ReactNode; title: string; lead: string; onBack?: () => void; children: ReactNode }) {
  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-label text-brand-text hover:underline">
          <ArrowLeft size={16} aria-hidden /> Use a different account
        </button>
      )}
      <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-brand-subtle text-brand-text">{icon}</div>
      <h2 className="text-page-title text-fg">{title}</h2>
      <p className="mb-6 mt-1 text-body text-fg-secondary">{lead}</p>
      {children}
    </div>
  );
}

function CodeInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <TextInputV2
      label="6-digit code"
      value={value}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      error={error ? { show: true, message: error } : undefined}
    />
  );
}

function StepError({ message }: { message: string }) {
  return (
    <div className="mt-4">
      <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="That didn't work" description={message} />
    </div>
  );
}
