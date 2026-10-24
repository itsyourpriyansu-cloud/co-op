import { TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import { presentStatus, toneToBlendColor, type StatusEntity } from '@tgs/design-tokens';
import type { AnyStatus } from '@tgs/types';

/** The only way to show a workflow status in the console: same tone + label as the app (docs/18 §6). */
export function StatusTag({ entity, status, size = TagV2Size.SM }: { entity: StatusEntity; status: AnyStatus | 'PLEDGED'; size?: TagV2Size }) {
  const { tone, label } = presentStatus(entity, status, 'staff');
  return (
    <TagV2
      text={label}
      size={size}
      type={TagV2Type.SUBTLE}
      subType={TagV2SubType.ROUNDED}
      color={toneToBlendColor[tone] as TagV2Color}
    />
  );
}
