// TIER 2 — SEMANTIC. What screens use. Light and dark share the same role names.
// D-150: the values are the phone's Astryx tokens (apps/member-app/src/theme.ts, docs/25): neutrals 60,
// the seal navy 30 (brand = the one accent), gold 10 (marks only). Status colours carry meaning only.
// `foundation.test.ts` checks every text pair for WCAG AA.
import { brand } from './brand';

const b = brand.primaryScale;

export interface StatusRole {
  /** Text/icon on a subtle background. */
  fg: string;
  /** Subtle background (chips, alerts, rows). */
  bg: string;
  /** Border on subtle surfaces. */
  border: string;
  /** Solid fill (dots, progress, filled badges). */
  solid: string;
}

export interface SemanticColors {
  bg: { canvas: string; surface: string; surfaceSubtle: string; surfaceMuted: string; surfaceSunken: string; inverse: string; overlay: string };
  text: { primary: string; secondary: string; tertiary: string; disabled: string; inverse: string; link: string; onBrand: string };
  border: { subtle: string; default: string; strong: string; focus: string; brand: string };
  brand: { solid: string; hover: string; pressed: string; subtle: string; subtleHover: string; border: string; text: string };
  /** Seal gold: hero glow, active nav marker, rings. `text` is the only gold for words on a light surface. */
  gold: { solid: string; text: string; muted: string };
  status: { success: StatusRole; warning: StatusRole; danger: StatusRole; info: StatusRole; neutral: StatusRole; approval: StatusRole };
  money: { credit: string; debit: string; neutral: string };
  /** Categorical data-viz order (dataviz skill: muted series, one highlight). */
  chart: readonly string[];
}

export const light: SemanticColors = {
  bg: { canvas: '#F1F1F1', surface: '#FFFFFF', surfaceSubtle: '#FAFAFA', surfaceMuted: '#F5F5F5', surfaceSunken: '#EBEBEB', inverse: '#0A1317', overlay: 'rgba(0, 0, 0, 0.50)' },
  // Astryx has no tertiary; the console keeps one for captions, dark enough for AA on the canvas.
  text: { primary: '#0A1317', secondary: '#474747', tertiary: '#5E5E5E', disabled: '#919191', inverse: '#FFFFFF', link: b[500], onBrand: '#FFFFFF' },
  border: { subtle: '#F0F0F0', default: '#E5E5E5', strong: '#D4D4D4', focus: b[500], brand: b[200] },
  brand: { solid: b[500], hover: b[600], pressed: b[700], subtle: b[50], subtleHover: b[100], border: b[200], text: b[500] },
  gold: { solid: brand.gold.solid, text: brand.gold.text, muted: brand.gold.muted },
  status: {
    success: { fg: '#2A7230', bg: '#EDF6EC', border: '#BCE0BB', solid: '#198100' },
    warning: { fg: '#836700', bg: '#FDF5DC', border: '#FAE19E', solid: '#FFCE2F' },
    danger: { fg: '#C0262C', bg: '#FDECEA', border: '#FFC4BE', solid: '#C9303A' },
    info: { fg: '#0067CE', bg: '#E8F1FD', border: '#B9D7FF', solid: '#0067CE' },
    neutral: { fg: '#474747', bg: '#F1F1F1', border: '#D4D4D4', solid: '#6A6A6A' },
    approval: { fg: '#6B4FB3', bg: '#F1ECFA', border: '#D9CCF2', solid: '#6B4FB3' },
  },
  money: { credit: '#2A7230', debit: '#C0262C', neutral: '#0A1317' },
  chart: [b[500], brand.gold.solid, '#0067CE', '#2A7230', '#6B4FB3', '#919191', '#C9303A'],
};

export const dark: SemanticColors = {
  bg: { canvas: '#0B0F14', surface: '#151A21', surfaceSubtle: '#1B2129', surfaceMuted: '#1B2129', surfaceSunken: '#07090C', inverse: '#F1F1F1', overlay: 'rgba(0, 0, 0, 0.64)' },
  text: { primary: '#F1F1F1', secondary: '#C4C4C4', tertiary: '#A3A3A3', disabled: '#5E5E5E', inverse: '#0A1317', link: b[200], onBrand: '#FFFFFF' },
  border: { subtle: '#1F262F', default: '#2A323C', strong: '#3D4652', focus: b[300], brand: b[400] },
  brand: { solid: b[400], hover: b[300], pressed: b[200], subtle: '#0E2340', subtleHover: '#13305A', border: b[400], text: b[200] },
  gold: { solid: brand.gold.solid, text: '#E2BE73', muted: '#2B2210' },
  status: {
    success: { fg: '#8FD18F', bg: '#0E2A12', border: '#1E5A25', solid: '#3FA34D' },
    warning: { fg: '#F5D46B', bg: '#2E2608', border: '#5E4C0E', solid: '#FFCE2F' },
    danger: { fg: '#FF9E99', bg: '#3A1214', border: '#7A2328', solid: '#E0525A' },
    info: { fg: '#8EC1FF', bg: '#0D2340', border: '#1D4B85', solid: '#3D8EF0' },
    neutral: { fg: '#D4D4D4', bg: '#1F262F', border: '#3D4652', solid: '#919191' },
    approval: { fg: '#C8B6F0', bg: '#241A3D', border: '#4A3887', solid: '#9479D6' },
  },
  money: { credit: '#8FD18F', debit: '#FF9E99', neutral: '#F1F1F1' },
  chart: [b[300], brand.gold.solid, '#3D8EF0', '#3FA34D', '#9479D6', '#919191', '#E0525A'],
};

export const semanticColors = { light, dark } as const;
export type ColorScheme = keyof typeof semanticColors;
