import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { CardV2, CardV2Variant, EmptyState } from '@juspay/blend-design-system';
import { Illustration, ViewState } from '@/components/ViewState';

/** SYS-01 */
export function NoAccessPage() {
  return (
    <CardV2 variant={CardV2Variant.OUTLINED}>
      <ViewState state="noAccess" />
    </CardV2>
  );
}

/** SYS-02 */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <CardV2 variant={CardV2Variant.OUTLINED}>
      <EmptyState
        illustration={<Illustration icon={Compass} tone="neutral" />}
        title="Page not found"
        description="The link may be outdated, or the record was removed."
        primaryAction={{ label: 'Back to dashboard', onClick: () => navigate('/dashboard') }}
      />
    </CardV2>
  );
}

/** SYS-03: route-level error boundary. */
export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : undefined;
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg">
        <CardV2 variant={CardV2Variant.OUTLINED}>
          <EmptyState
            illustration={<Illustration icon={TriangleAlert} tone="danger" />}
            title="Something went wrong"
            description={detail ? `We couldn't show this page (${detail}). Your data is safe.` : "We couldn't show this page. Your data is safe."}
            primaryAction={{ label: 'Reload', onClick: () => window.location.assign('/dashboard') }}
          />
        </CardV2>
      </div>
    </div>
  );
}
