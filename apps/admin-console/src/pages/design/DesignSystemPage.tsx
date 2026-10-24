// /design: the living design system (docs/18) and state catalog (docs/19, docs/20).
// Every tab is deep-linkable: /design?tab=states&pattern=list&state=error
import { useSearchParams } from 'react-router';
import { TabsV2, TabsV2Content, TabsV2List, TabsV2Trigger, TabsV2Variant } from '@juspay/blend-design-system';
import { BLEND_VERSION } from '@tgs/design-tokens';
import { PageHeader } from '@/components/PageHeader';
import { ComponentsTab } from './ComponentsTab';
import { FoundationsTab } from './FoundationsTab';
import { ScenariosTab } from './ScenariosTab';
import { StatesTab } from './StatesTab';
import { StatusTab } from './StatusTab';

const TABS = [
  { value: 'foundations', label: 'Foundations' },
  { value: 'components', label: 'Components' },
  { value: 'status', label: 'Status language' },
  { value: 'states', label: 'States' },
  { value: 'scenarios', label: 'Scenarios' },
] as const;

export function DesignSystemPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as string) : 'foundations';

  return (
    <>
      <PageHeader
        title="Design System"
        description={`TGSECCSL on Juspay Blend ${BLEND_VERSION}. One token source drives this console (Blend ThemeProvider + CSS variables) and the Member App (native kit). See docs/18 and docs/19.`}
      />
      <TabsV2 value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsV2List variant={TabsV2Variant.UNDERLINE}>
          {TABS.map((t) => (
            <TabsV2Trigger key={t.value} value={t.value} variant={TabsV2Variant.UNDERLINE}>
              {t.label}
            </TabsV2Trigger>
          ))}
        </TabsV2List>
        <div className="pt-6">
          <TabsV2Content value="foundations">
            <FoundationsTab />
          </TabsV2Content>
          <TabsV2Content value="components">
            <ComponentsTab />
          </TabsV2Content>
          <TabsV2Content value="status">
            <StatusTab />
          </TabsV2Content>
          <TabsV2Content value="states">
            <StatesTab />
          </TabsV2Content>
          <TabsV2Content value="scenarios">
            <ScenariosTab />
          </TabsV2Content>
        </div>
      </TabsV2>
    </>
  );
}
