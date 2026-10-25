// ST-60 … ST-67 Settings: one page, a section list on the left, the section on the right.
import { Navigate, NavLink, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, HandCoins, History, Landmark, Lock, MessageSquareText, PiggyBank, ShieldCheck, Umbrella, Users, type LucideIcon } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type } from '@juspay/blend-design-system';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DepartmentsSection } from './DepartmentsSection';
import { DepositsSection } from './DepositsSection';
import { GeneralSection } from './GeneralSection';
import { HistorySection } from './HistorySection';
import { InsuranceDemandSection } from './InsuranceDemandSection';
import { LoanProductsSection } from './LoanProductsSection';
import { PermissionsSection } from './PermissionsSection';
import { TemplatesSection } from './TemplatesSection';
import { UsersSection } from './UsersSection';

const SECTIONS: Array<{ id: string; label: string; screen: string; icon: LucideIcon; hint: string }> = [
  { id: 'general', label: 'General', screen: 'ST-60', icon: Landmark, hint: 'Society, shares, service' },
  { id: 'loan-products', label: 'Loan products', screen: 'ST-64', icon: HandCoins, hint: 'Rates, limits, workflow' },
  { id: 'deposits', label: 'Deposit schemes', screen: 'ST-65', icon: PiggyBank, hint: 'FD slabs, CRD, SRDS, savings' },
  { id: 'insurance-demand', label: 'Insurance & demand', screen: 'ST-66', icon: Umbrella, hint: 'Monthly heads, defaulters' },
  { id: 'departments', label: 'Departments & DDOs', screen: 'ST-67', icon: Building2, hint: 'Who certifies and deducts' },
  { id: 'users', label: 'Users', screen: 'ST-61', icon: Users, hint: 'Staff logins and roles' },
  { id: 'permissions', label: 'Permissions', screen: 'ST-62', icon: ShieldCheck, hint: 'What each role can do' },
  { id: 'templates', label: 'Notification templates', screen: 'ST-63', icon: MessageSquareText, hint: 'SMS, WhatsApp, email, app' },
  { id: 'history', label: 'Change history', screen: 'ST-68', icon: History, hint: 'Who changed what' },
];

export function SettingsPage() {
  const { section = '' } = useParams();
  const bundle = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const current = SECTIONS.find((s) => s.id === section);
  if (!current) return <Navigate to="/settings/general" replace />;

  return (
    <>
      <PageHeader title="Settings" description="Rates, limits, masters and messages. Every change is validated and recorded with your name." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <NavLink
                  to={`/settings/${s.id}`}
                  className={({ isActive }) =>
                    cn('flex items-start gap-3 rounded-control px-3 py-2.5 transition-colors', isActive ? 'bg-brand-subtle text-brand-text' : 'text-fg-secondary hover:bg-surface-subtle hover:text-fg')
                  }
                >
                  <s.icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-label">{s.label}</span>
                    <span className="hidden text-caption text-fg-tertiary lg:block">{s.hint}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {bundle.data && !bundle.data.canEdit && (
            <div className="mb-5">
              <AlertV2 type={AlertV2Type.NEUTRAL} subType={AlertV2SubType.SUBTLE} heading="View only" description="Only the Super Admin can change settings. Switch persona to Anitha Rao to edit." slot={{ slot: <Lock size={16} /> }} />
            </div>
          )}
          <ViewState state={bundle.isLoading ? 'loading' : bundle.isError ? 'error' : 'ready'} layout="form" onRetry={() => void bundle.refetch()}>
            {bundle.data && (
              <>
                {section === 'general' && <GeneralSection bundle={bundle.data} />}
                {section === 'loan-products' && <LoanProductsSection bundle={bundle.data} />}
                {section === 'deposits' && <DepositsSection bundle={bundle.data} />}
                {section === 'insurance-demand' && <InsuranceDemandSection bundle={bundle.data} />}
                {section === 'departments' && <DepartmentsSection canEdit={bundle.data.canEdit} />}
                {section === 'users' && <UsersSection canEdit={bundle.data.canEdit} />}
                {section === 'permissions' && <PermissionsSection />}
                {section === 'templates' && <TemplatesSection canEdit={bundle.data.canEdit} />}
                {section === 'history' && <HistorySection bundle={bundle.data} />}
              </>
            )}
          </ViewState>
        </div>
      </div>
    </>
  );
}
