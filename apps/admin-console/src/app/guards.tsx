import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Permission } from '@tgs/types';
import { NoAccessPage } from '@/pages/SystemPages';
import { useAuth } from './auth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
  const { can, isLoadingMe } = useAuth();
  if (isLoadingMe) return null;
  if (!can(permission)) return <NoAccessPage />;
  return <>{children}</>;
}
