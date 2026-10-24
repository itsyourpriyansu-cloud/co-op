import { CardV2, CardV2Variant, EmptyState, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { PageHeader } from '@/components/PageHeader';
import { Illustration } from '@/components/ViewState';
import type { NavItem } from '@/config/navigation';

/** Route skeleton for a module whose screens are built in a later milestone. */
export function ModulePage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader
        title={item.label}
        description={item.description}
        meta={<TagV2 text={`Builds in ${item.milestone}`} size={TagV2Size.SM} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} color={TagV2Color.PRIMARY} />}
      />
      <CardV2 variant={CardV2Variant.OUTLINED}>
        <EmptyState
          illustration={<Illustration icon={item.icon} />}
          title={`${item.label} is next on the build plan`}
          description={`Screens ${item.screens} are specified in docs/06 and docs/19, with every state designed. They are built in milestone ${item.milestone}.`}
        />
      </CardV2>
    </>
  );
}
