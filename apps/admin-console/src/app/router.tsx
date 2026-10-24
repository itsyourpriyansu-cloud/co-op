import { createBrowserRouter, Navigate } from 'react-router';
import { NAV_ITEMS } from '@/config/navigation';
import { DashboardPage } from '@/pages/DashboardPage';
import { DesignSystemPage } from '@/pages/design/DesignSystemPage';
import { LoginPage } from '@/pages/LoginPage';
import { ModulePage } from '@/pages/ModulePage';
import { NoAccessPage, NotFoundPage, RouteErrorPage } from '@/pages/SystemPages';
import { RequireAuth, RequirePermission } from './guards';
import { ConsoleShell } from './shell/ConsoleShell';

const BUILT = new Set(['dashboard', 'design']);

// Route map mirrors docs/04 §2. Modules render a skeleton page until their milestone (docs/14).
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <ConsoleShell />
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
      {
        path: 'design',
        element: (
          <RequirePermission permission="demo.control">
            <DesignSystemPage />
          </RequirePermission>
        ),
      },
      ...NAV_ITEMS.filter((item) => !BUILT.has(item.id)).map((item) => ({
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
