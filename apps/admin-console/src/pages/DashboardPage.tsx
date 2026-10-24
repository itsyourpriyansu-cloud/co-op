import { Link } from 'react-router';
import { ArrowRight, Construction } from 'lucide-react';
import { ROLE_LABELS } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { NAV_ITEMS } from '@/config/navigation';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** ST-01 placeholder: the role dashboards (docs/04 §5) are built in M9. */
export function DashboardPage() {
  const { session, can } = useAuth();
  if (!session) return null;
  const firstName = session.user.name.split(' ')[0];
  const modules = NAV_ITEMS.filter((item) => item.path !== '/dashboard' && can(item.permission));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Signed in as ${ROLE_LABELS[session.user.role]}${session.user.departmentId ? ' · your department only' : ''}`}
      />

      <Card className="mb-6 flex items-start gap-3 border-accent/40 bg-accent/5 p-4">
        <Construction className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">Foundation build (M0)</p>
          <p className="text-muted">
            Roles, navigation and the API are live. Each module below opens with its screens as its
            milestone is built.
          </p>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-muted">Your workspace</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <li key={item.path}>
            <Link
              to={item.path}
              className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
                  <item.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </div>
                <Badge tone="neutral">{item.milestone}</Badge>
              </div>
              <h3 className="font-semibold">{item.label}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{item.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open{' '}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
