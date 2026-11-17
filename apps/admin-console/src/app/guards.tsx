import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Type } from '@juspay/blend-design-system';
import { PenLine } from 'lucide-react';
import type { Permission } from '@tgs/types';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { NoAccessPage } from '@/pages/SystemPages';
import { useAuth } from './auth';
import { MySignatureForm, signatureKey } from './shell/MySignatureDrawer';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, mustChangePassword } = useAuth();
  const location = useLocation();
  // A temporary password must be replaced before anything else (the sign-in page asks for it).
  if (!session || mustChangePassword) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <RequireSignature>{children}</RequireSignature>;
}

/**
 * F-01 (D-126): the last sign-in step. A staff member with no signature on file adds one before using
 * the console; once it is on file this never shows again. If the check fails (offline), the console
 * opens as before and the signing steps still refuse until a signature exists.
 */
function RequireSignature({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const mine = useQuery({ queryKey: signatureKey, queryFn: api.signatures.mine });
  if (mine.isPending) return <ViewState state="loading" layout="detail" />;
  if (mine.data !== null) return <>{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <section className="w-full max-w-md rounded-card border border-line bg-surface p-8 shadow-raised">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-brand-subtle text-brand-text">
          <PenLine size={22} aria-hidden />
        </div>
        <h1 className="text-page-title text-fg">Add your signature</h1>
        <p className="mb-6 mt-1 text-body text-fg-secondary">One last step. Your signature is printed on what you approve, certify or pay out. A photo of your signature on plain white paper (JPG or PNG). You can change it later from your name in the top bar.</p>
        <MySignatureForm />
        <div className="mt-6 border-t border-line-subtle pt-4">
          <ButtonV2 text="Sign out" buttonType={ButtonV2Type.SECONDARY} onClick={() => void logout()} />
        </div>
      </section>
    </main>
  );
}

/** UX guard only: the API enforces the same permission server-side (docs/03 §4). */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can, isLoadingMe, meError, retryMe } = useAuth();
  if (isLoadingMe) return <ViewState state="loading" layout="table" />;
  // Server unreachable: say so, with Retry. Never claim "no access" without the permission list.
  if (meError) return <ViewState state="error" layout="table" onRetry={retryMe} />;
  if (!can(permission)) return <NoAccessPage />;
  return <>{children}</>;
}
