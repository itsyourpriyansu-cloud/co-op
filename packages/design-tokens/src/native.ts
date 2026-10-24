// TIER 3 (native) — React Native shapes for the Member App: plain numbers, RN shadow objects.
import { brand } from './brand';
import { semanticColors, type ColorScheme } from './semantic';
import { nativeTextRoles, type TextRole, type TextRoleName } from './typography';
import { layout, motion, radius, space, spacing } from './layout';

export interface NativeShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/** Approximations of Blend's shadows.xs/sm/md/lg for iOS shadow* + Android elevation. */
export const nativeElevation: Record<'flat' | 'raised' | 'card' | 'hover' | 'dropdown' | 'modal', NativeShadow> = {
  flat: { shadowColor: '#050506', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  raised: { shadowColor: '#050506', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1, elevation: 1 },
  card: { shadowColor: '#050506', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  hover: { shadowColor: '#050506', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  dropdown: { shadowColor: '#050506', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 8 },
  modal: { shadowColor: '#050506', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.07, shadowRadius: 24, elevation: 16 },
};

export interface NativeTextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing?: number;
  fontVariant?: Array<'tabular-nums'>;
  textTransform?: 'uppercase';
  fontFamily?: string;
}

function toNativeText(r: TextRole): NativeTextStyle {
  return {
    fontSize: r.fontSize,
    lineHeight: r.lineHeight,
    fontWeight: String(r.fontWeight) as NativeTextStyle['fontWeight'],
    ...(r.letterSpacing ? { letterSpacing: r.letterSpacing } : {}),
    ...(r.tabular ? { fontVariant: ['tabular-nums' as const] } : {}),
    ...(r.uppercase ? { textTransform: 'uppercase' as const } : {}),
    ...(brand.fontFamily.native.sans ? { fontFamily: brand.fontFamily.native.sans } : {}),
  };
}

export const nativeText = Object.fromEntries(
  Object.entries(nativeTextRoles).map(([k, v]) => [k, toNativeText(v)]),
) as Record<TextRoleName, NativeTextStyle>;

export function nativeTheme(scheme: ColorScheme = 'light') {
  return {
    scheme,
    color: semanticColors[scheme],
    text: nativeText,
    space,
    spacing,
    radius,
    elevation: nativeElevation,
    motion,
    layout: layout.app,
    touchTarget: layout.touchTarget.app,
  } as const;
}

export type NativeTheme = ReturnType<typeof nativeTheme>;
