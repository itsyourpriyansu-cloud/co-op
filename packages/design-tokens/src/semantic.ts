// TIER 2 — SEMANTIC. What screens use. Every value points at a foundation step that Blend's own
// components use for the same purpose (e.g. card title gray-800, body gray-600, secondary gray-500,
// warning = orange scale, card radius 12). Light and dark share the same role names.
import { palette as p } from './foundation';
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
  status: { success: StatusRole; warning: StatusRole; danger: StatusRole; info: StatusRole; neutral: StatusRole; approval: StatusRole };
  money: { credit: string; debit: string; neutral: string };
  /** Categorical data-viz order (dataviz skill: muted series, one highlight). */
  chart: readonly string[];
}

export const light: SemanticColors = {
  bg: { canvas: p.gray[50], surface: p.gray[0], surfaceSubtle: p.gray[25], surfaceMuted: p.gray[100], surfaceSunken: p.gray[150], inverse: p.gray[900], overlay: 'rgba(14, 18, 27, 0.48)' },
  // tertiary: a touch darker than gray-500 (#717784 = 4.49:1) so captions pass WCAG AA on every surface (D-064).
  text: { primary: p.gray[800], secondary: p.gray[600], tertiary: '#666C79', disabled: p.gray[400], inverse: p.gray[0], link: b[600], onBrand: p.gray[0] },
  border: { subtle: p.gray[150], default: p.gray[200], strong: p.gray[300], focus: b[500], brand: b[200] },
  brand: { solid: b[600], hover: b[700], pressed: b[800], subtle: b[50], subtleHover: b[100], border: b[200], text: b[700] },
  status: {
    success: { fg: p.green[700], bg: p.green[50], border: p.green[200], solid: p.green[600] },
    warning: { fg: p.orange[700], bg: p.orange[50], border: p.orange[200], solid: p.orange[500] },
    danger: { fg: p.red[700], bg: p.red[50], border: p.red[200], solid: p.red[600] },
    info: { fg: b[700], bg: b[50], border: b[200], solid: b[600] },
    neutral: { fg: p.gray[700], bg: p.gray[100], border: p.gray[200], solid: p.gray[500] },
    approval: { fg: p.purple[700], bg: p.purple[50], border: p.purple[200], solid: p.purple[500] },
  },
  money: { credit: p.green[700], debit: p.red[700], neutral: p.gray[800] },
  chart: [b[500], p.purple[500], p.orange[400], p.green[500], p.yellow[500], p.gray[400], p.red[400]],
};

export const dark: SemanticColors = {
  bg: { canvas: p.gray[950], surface: p.gray[900], surfaceSubtle: p.gray[800], surfaceMuted: p.gray[800], surfaceSunken: p.gray[1000], inverse: p.gray[50], overlay: 'rgba(5, 5, 6, 0.64)' },
  text: { primary: p.gray[50], secondary: p.gray[300], tertiary: p.gray[400], disabled: p.gray[600], inverse: p.gray[900], link: b[400], onBrand: p.gray[0] },
  border: { subtle: p.gray[800], default: p.gray[700], strong: p.gray[600], focus: b[400], brand: b[800] },
  brand: { solid: b[500], hover: b[400], pressed: b[300], subtle: b[950], subtleHover: b[900], border: b[800], text: b[300] },
  status: {
    success: { fg: p.green[300], bg: p.green[950], border: p.green[800], solid: p.green[500] },
    warning: { fg: p.orange[300], bg: p.orange[950], border: p.orange[800], solid: p.orange[400] },
    danger: { fg: p.red[300], bg: p.red[950], border: p.red[800], solid: p.red[500] },
    info: { fg: b[300], bg: b[950], border: b[800], solid: b[500] },
    neutral: { fg: p.gray[200], bg: p.gray[800], border: p.gray[700], solid: p.gray[400] },
    approval: { fg: p.purple[300], bg: p.purple[950], border: p.purple[800], solid: p.purple[400] },
  },
  money: { credit: p.green[400], debit: p.red[400], neutral: p.gray[50] },
  chart: [b[400], p.purple[400], p.orange[300], p.green[400], p.yellow[400], p.gray[400], p.red[300]],
};

export const semanticColors = { light, dark } as const;
export type ColorScheme = keyof typeof semanticColors;
