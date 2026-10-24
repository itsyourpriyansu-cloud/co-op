import { Compass, ShieldAlert, TriangleAlert } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const homeAction = (
  <Link to="/dashboard" className={buttonVariants({ variant: 'outline' })}>
    Back to dashboard
  </Link>
);

/** SYS-01 */
export function NoAccessPage() {
  return (
    <Card>
      <EmptyState icon={ShieldAlert} title="You don't have access to this page" action={homeAction}>
        This area belongs to another role. Ask the Super Admin if you think you should have access.
      </EmptyState>
    </Card>
  );
}

/** SYS-02 */
export function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={Compass} title="Page not found" action={homeAction}>
        The link may be outdated, or the record was removed.
      </EmptyState>
    </Card>
  );
}

/** SYS-03: route-level error boundary. */
export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong"
          action={<Button onClick={() => window.location.assign('/dashboard')}>Reload</Button>}
        >
          <p>We couldn't show this page. Your data is safe. Reload to try again.</p>
          {detail && <p className="mt-2 font-mono text-xs">{detail}</p>}
        </EmptyState>
      </Card>
    </div>
  );
}
