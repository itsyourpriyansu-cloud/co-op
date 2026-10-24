// TIER 1 — FOUNDATION. A value-for-value mirror of Juspay Blend's FOUNDATION_THEME
// (@juspay/blend-design-system 0.0.38, MIT, lib/tokens/*.tokens.ts).
// Mirrored (not imported) so the React Native app can use it: Blend itself is web-only.
// `foundation.test.ts` fails if Blend's values and these ever drift apart.
// Never use these directly in screens — use the semantic tier (semantic.ts).

export const BLEND_VERSION = '0.0.38';

export const palette = {
  gray: {
    0: '#FFFFFF', 25: '#FCFCFD', 50: '#F5F7FA', 100: '#F2F4F8', 150: '#ECEFF3', 200: '#E1E4EA',
    300: '#CACFD8', 400: '#99A0AE', 500: '#717784', 600: '#525866', 700: '#2B303B', 800: '#222530',
    900: '#181B25', 950: '#0E121B', 1000: '#050506',
  },
  primary: {
    50: '#EFF6FF', 100: '#DBEAFE', 200: '#BEDBFF', 300: '#8EC5FF', 400: '#51A2FF', 500: '#2B7FFF',
    600: '#0561E2', 700: '#1447E6', 800: '#193CB8', 900: '#1C398E', 950: '#162456',
  },
  purple: {
    50: '#FAF5FF', 100: '#F3E8FF', 200: '#E9D4FF', 300: '#DAB2FF', 400: '#C27AFF', 500: '#AD46FF',
    600: '#9810FA', 700: '#8200DB', 800: '#6E11B0', 900: '#59168B', 950: '#3C0366',
  },
  orange: {
    50: '#FFF7ED', 100: '#FFEDD4', 200: '#FFD6A8', 300: '#FFB86A', 400: '#FF8904', 500: '#FF6900',
    600: '#F54A00', 700: '#CA3500', 800: '#9F2D00', 900: '#7E2A0C', 950: '#441306',
  },
  red: {
    50: '#FEF2F2', 100: '#FFE2E2', 200: '#FFC9C9', 300: '#FFA2A2', 400: '#FF6467', 500: '#FB2C36',
    600: '#E7000B', 700: '#C10007', 800: '#9F0712', 900: '#82181A', 950: '#460809',
  },
  green: {
    50: '#F0FDF4', 100: '#DCFCE7', 200: '#B9F8CF', 300: '#7BF1A8', 400: '#00D492', 500: '#00C951',
    600: '#00A63E', 700: '#008236', 800: '#016630', 900: '#0D542B', 950: '#052E16',
  },
  yellow: {
    50: '#FEFCE8', 100: '#FEF9C2', 200: '#FFF085', 300: '#FFDF20', 400: '#FCC800', 500: '#EFB100',
    600: '#D08700', 700: '#A65F00', 800: '#894B00', 900: '#733E0A', 950: '#432004',
  },
} as const;

export type PaletteName = keyof typeof palette;

/** Blend font tokens. Family is overridden in brand.ts (Blend expects a self-hosted "InterDisplay"). */
export const font = {
  family: { display: 'InterDisplay', body: 'InterDisplay', heading: 'InterDisplay', mono: 'SF Mono' },
  weight: { 100: 100, 200: 200, 300: 300, 400: 400, 500: 500, 600: 600, 700: 700, 800: 800, 900: 900 },
  letterSpacing: { compressed: -2, condensed: -1, normal: 0, expanded: 1, extended: 2 },
  size: {
    base: 16,
    body: {
      xs: { fontSize: 10, lineHeight: 14, letterSpacing: 0 },
      sm: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
      md: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
      lg: { fontSize: 16, lineHeight: 24, letterSpacing: 0 },
    },
    heading: {
      sm: { fontSize: 18, lineHeight: 24, letterSpacing: 0 },
      md: { fontSize: 20, lineHeight: 28, letterSpacing: 0 },
      lg: { fontSize: 24, lineHeight: 32, letterSpacing: 0 },
      xl: { fontSize: 32, lineHeight: 38, letterSpacing: 0 },
      '2xl': { fontSize: 40, lineHeight: 46, letterSpacing: 0 },
    },
    display: {
      sm: { fontSize: 48, lineHeight: 56, letterSpacing: 0 },
      md: { fontSize: 56, lineHeight: 64, letterSpacing: 0 },
      lg: { fontSize: 64, lineHeight: 70, letterSpacing: 0 },
      xl: { fontSize: 72, lineHeight: 78, letterSpacing: 0 },
    },
    code: {
      sm: { fontSize: 10, lineHeight: 14, letterSpacing: 0 },
      md: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
      lg: { fontSize: 14, lineHeight: 18, letterSpacing: 0 },
    },
  },
  fontSize: {
    10: 10, 12: 12, 14: 14, 16: 16, 18: 18, 20: 20, 24: 24, 28: 28, 32: 32, 36: 36, 38: 38, 40: 40,
    44: 44, 48: 48, 52: 52, 56: 56, 60: 60, 64: 64, 68: 68, 72: 72, 76: 76, 80: 80, 84: 84, 88: 88,
    92: 92, 96: 96, 100: 100,
  },
  lineHeight: {
    12: 12, 14: 14, 16: 16, 18: 18, 20: 20, 24: 24, 28: 28, 32: 32, 36: 36, 38: 38, 40: 40, 44: 44,
    48: 48, 52: 52, 56: 56, 60: 60, 64: 64, 68: 68, 72: 72, 76: 76, 80: 80, 84: 84, 88: 88, 92: 92,
    96: 96, 100: 100,
  },
} as const;

export const unit = {
  0: '0px', 0.5: '0.5px', 1: '1px', 1.5: '1.5px', 2: '2px', 3: '3px', 4: '4px', 5: '5px', 6: '6px',
  7: '7px', 8: '8px', 9: '9px', 10: '10px', 11: '11px', 12: '12px', 13: '13px', 14: '14px', 15: '15px',
  16: '16px', 16.5: '16.5px', 18: '18px', 18.5: '18.5px', 20: '20px', 22: '22px', 24: '24px', 28: '28px',
  30: '30px', 32: '32px', 36: '36px', 40: '40px', 42: '42px', 44: '44px', 48: '48px', 50: '50px',
  52: '52px', 56: '56px', 64: '64px', 80: '80px', 100: '100px', 120: '120px', 144: '144px', 150: '150px',
  190: '190px', 200: '200px', 280: '280px', 350: '350px', auto: 'auto',
} as const;

export const border = {
  width: { 0: '0px', 1: '1px', 1.5: '1.5px', 2: '2px', 3: '3px', 4: '4px' },
  radius: {
    0: '0px', 2: '2px', 4: '4px', 6: '6px', 8: '8px', 10: '10px', 12: '12px', 16: '16px', 20: '20px',
    24: '24px', 28: '28px', 100: '100px', full: '9999px',
  },
} as const;

export const shadows = {
  xs: '0px 1px 1px 0px rgba(5, 5, 6, 0.04)',
  sm: '0px 2px 3px 0px rgba(5, 5, 6, 0.05)',
  md: '0px 2px 8px 1px rgba(5, 5, 6, 0.07)',
  lg: '0px 3px 16px 3px rgba(5, 5, 6, 0.07)',
  xl: '0px 10px 20px 3px rgba(5, 5, 6, 0.07)',
  '2xl': '0px 12px 24px 4px rgba(5, 5, 6, 0.07)',
  full: '0px 24px 48px 8px rgba(5, 5, 6, 0.07)',
  focusPrimary: '0px 0px 0px 3px #EFF6FF',
  focusError: '0px 0px 0px 3px #FFC9C9',
} as const;

export const opacity = {
  0: 0, 5: 0.05, 10: 0.1, 20: 0.2, 30: 0.3, 40: 0.4, 50: 0.5, 60: 0.6, 70: 0.7, 80: 0.8, 90: 0.9, 100: 1,
} as const;

export const zIndex = { 0: 0, 10: 10, 99: 99, 100: 100, 101: 101, 1000: 1000, 1100: 1100, 1200: 1200, 9999: 9999 } as const;

/** Blend breakpoints (lib/breakpoints/breakPoints.ts). */
export const breakpoints = { sm: 320, lg: 1024 } as const;

export const foundation = { colors: palette, font, unit, border, shadows, opacity, zIndex } as const;
export type Foundation = typeof foundation;
