// App theme = shared design tokens (docs/18). Light only for the MVP (docs/12 §3).
import { nativeTheme, type NativeTextStyle, type TextRoleName } from '@tgs/design-tokens';

export const theme = nativeTheme('light');
export const color = theme.color;
export const space = theme.space;
export const spacing = theme.spacing;
export const radius = theme.radius;
export const elevation = theme.elevation;
export const touchTarget = theme.touchTarget;

/** Inter is loaded per weight (Android does not synthesise weights for custom fonts). */
export const FONT_BY_WEIGHT: Record<NativeTextStyle['fontWeight'], string> = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
};

/** RN text style for a role, using the matching Inter face. */
export function textStyle(role: TextRoleName) {
  const { fontWeight, ...rest } = theme.text[role];
  return { ...rest, fontFamily: FONT_BY_WEIGHT[fontWeight] };
}

/** Secondary text on the brand-blue hero cards: 5:1 on brand.solid (WCAG AA, D-064). Replaces translucent white. */
export const onBrandMuted = '#EEF4FE';
/** Tile inside a brand card: a darker tint keeps white text ≥ 6.7:1. */
export const onBrandTile = 'rgba(0,0,0,0.12)';
