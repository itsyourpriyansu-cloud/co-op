import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { NavItem } from '@/config/navigation';

/** Route skeleton for a module whose screens are built in a later milestone. */
export function ModulePage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader
        title={item.label}
        description={item.description}
        actions={<Badge tone="primary">Arrives in {item.milestone}</Badge>}
      />
      <Card>
        <EmptyState icon={item.icon} title={`${item.label} is next on the build plan`}>
          <p>
            Screens {item.screens} are specified in <code>docs/06-screen-specs.md</code> and are
            built in milestone {item.milestone}.
          </p>
        </EmptyState>
      </Card>
    </>
  );
}
