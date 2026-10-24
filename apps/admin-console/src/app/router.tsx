import { createBrowserRouter, Navigate } from 'react-router';
import { NAV_ITEMS } from '@/config/navigation';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { ModulePage } from '@/pages/ModulePage';
import { NoAccessPage, NotFoundPage, RouteErrorPage } from '@/pages/SystemPages';
import { RequireAuth, RequirePermission } from './guards';
import { StaffShell } from './shell/StaffShell';

// Route map mirrors docs/04 §2 (sitemap). Module routes are skeletons until their milestone.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <StaffShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <RequirePermission permission="dashboard.view">
            <DashboardPage />
          </RequirePermission>
        ),
      },
      ...NAV_ITEMS.filter((item) => item.path !== '/dashboard').map((item) => ({
        path: `${item.path.slice(1)}/*`,
        element: (
          <RequirePermission permission={item.permission}>
            <ModulePage item={item} />
          </RequirePermission>
        ),
      })),
      { path: 'no-access', element: <NoAccessPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
