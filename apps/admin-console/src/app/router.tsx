import { createBrowserRouter, Navigate } from 'react-router';
import { NAV_ITEMS } from '@/config/navigation';
import { DemandSheetPage } from '@/pages/collections/DemandSheetPage';
import { DemandSheetsPage } from '@/pages/collections/DemandSheetsPage';
import { GenerateDemandPage } from '@/pages/collections/GenerateDemandPage';
import { NewReceiptPage } from '@/pages/collections/NewReceiptPage';
import { PaymentsPage } from '@/pages/collections/PaymentsPage';
import { ReceiptPage } from '@/pages/collections/ReceiptPage';
import { RecoveryPage } from '@/pages/collections/RecoveryPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { DepositDetailPage } from '@/pages/deposits/DepositDetailPage';
import { DepositFormPage } from '@/pages/deposits/DepositFormPage';
import { DepositsPage } from '@/pages/deposits/DepositsPage';
import { FdrPage } from '@/pages/deposits/FdrPage';
import { DesignSystemPage } from '@/pages/design/DesignSystemPage';
import { JoiningDetailPage } from '@/pages/joining/JoiningDetailPage';
import { JoiningPage } from '@/pages/joining/JoiningPage';
import { LoginPage } from '@/pages/LoginPage';
import { LoanDetailPage } from '@/pages/loans/LoanDetailPage';
import { SanctionLetterPage } from '@/pages/loans/SanctionLetterPage';
import { WorkQueuePage } from '@/pages/WorkQueuePage';
import { LoanFormPage } from '@/pages/loans/LoanFormPage';
import { LoansPage } from '@/pages/loans/LoansPage';
import { ChangeRequestsPage } from '@/pages/members/ChangeRequestsPage';
import { MemberFormPage } from '@/pages/members/MemberFormPage';
import { MemberProfilePage } from '@/pages/members/MemberProfilePage';
import { MembersPage } from '@/pages/members/MembersPage';
import { ModulePage } from '@/pages/ModulePage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { AgreementPrintPage, DefaulterNoticePrintPage, FdFormPrintPage, LoanFormPrintPage, MembershipFormPrintPage } from '@/pages/reports/PrintForms';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { ReportViewerPage } from '@/pages/reports/ReportViewerPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { NoAccessPage, NotFoundPage, RouteErrorPage } from '@/pages/SystemPages';
import { RequireAuth, RequirePermission } from './guards';
import { ConsoleShell } from './shell/ConsoleShell';

const BUILT = new Set(['dashboard', 'queue', 'design', 'joining', 'members', 'loans', 'deposits', 'demand-sheets', 'payments', 'reports', 'settings']);

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
        path: 'joining',
        element: (
          <RequirePermission permission="membership.view">
            <JoiningPage />
          </RequirePermission>
        ),
      },
      {
        path: 'joining/:id',
        element: (
          <RequirePermission permission="membership.view">
            <JoiningDetailPage />
          </RequirePermission>
        ),
      },
      // ST-10 … ST-13, ST-18 (M3 Members module)
      ...(
        [
          ['members', <MembersPage />, 'members.view'],
          ['members/change-requests', <ChangeRequestsPage />, 'members.view'],
          ['members/new', <MemberFormPage />, 'members.edit'],
          ['members/:id', <MemberProfilePage />, 'members.view'],
          ['members/:id/edit', <MemberFormPage />, 'members.edit'],
          // ST-20, ST-21, ST-23 (M4 Loans core)
          ['loans', <LoansPage />, 'loans.view'],
          ['loans/new', <LoanFormPage />, 'loans.create'],
          ['loans/:id', <LoanDetailPage />, 'loans.view'],
          ['loans/:id/letter', <SanctionLetterPage />, 'loans.view'],
          // ST-02 (M5)
          ['queue', <WorkQueuePage />, 'queue.view'],
          // ST-30 … ST-33 + FDR print (M6 Deposits)
          ['deposits', <DepositsPage />, 'deposits.view'],
          ['deposits/new', <DepositFormPage />, 'deposits.open'],
          ['deposits/:id', <DepositDetailPage />, 'deposits.view'],
          ['deposits/:id/fdr', <FdrPage />, 'deposits.view'],
          // ST-40 … ST-47 (M7 Demand & collections)
          ['demand-sheets', <DemandSheetsPage />, 'collections.view'],
          ['demand-sheets/generate', <GenerateDemandPage />, 'collections.view'],
          ['demand-sheets/:id', <DemandSheetPage />, 'collections.view'],
          ['demand-sheets/:id/recovery', <RecoveryPage />, 'collections.view'],
          ['payments', <PaymentsPage />, 'collections.view'],
          ['payments/new', <NewReceiptPage />, 'collections.view'],
          ['payments/:id', <ReceiptPage />, 'collections.view'],
          // ST-50 … ST-52 (M9)
          ['reports', <ReportsPage />, 'reports.view'],
          ['reports/print/defaulter-notice', <DefaulterNoticePrintPage />, 'reports.view'],
          ['reports/print/membership', <MembershipFormPrintPage />, 'membership.view'],
          ['reports/print/loan-form', <LoanFormPrintPage />, 'loans.view'],
          ['reports/print/fd-form', <FdFormPrintPage />, 'deposits.view'],
          ['reports/print/agreement', <AgreementPrintPage />, 'members.view'],
          ['reports/:id', <ReportViewerPage />, 'reports.view'],
          // ST-03 (M9)
          ['notifications', <NotificationsPage />, 'dashboard.view'],
        ] as const
      ).map(([path, element, permission]) => ({ path, element: <RequirePermission permission={permission}>{element}</RequirePermission> })),
      {
        path: 'settings/:section?',
        element: (
          <RequirePermission permission="settings.view">
            <SettingsPage />
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
