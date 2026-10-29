import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Permission } from '@tgs/types';
import { ViewState } from '@/components/ViewState';
import { NoAccessPage } from '@/pages/SystemPages';
import { useAuth } from './auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, mustChangePassword } = useAuth();
  const location = useLocation();
  // A temporary password must be replaced before anything else (the sign-in page asks for it).
  if (!session || mustChangePassword) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
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
