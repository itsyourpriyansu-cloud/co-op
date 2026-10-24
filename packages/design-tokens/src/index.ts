// Single source of design tokens (docs/12 §3–4). PLACEHOLDER palette until the society's
// brand arrives (Q-008). Web consumes css/tokens.css (generated: `npm run tokens`),
// the Member App imports these objects directly.

export const colors = {
  light: {
    primary: '#0F5E6E',
    primaryForeground: '#FFFFFF',
    primarySubtle: '#E6F2F4',
    accent: '#C8902E',
    accentForeground: '#14181C',
    background: '#F7F8FA',
    surface: '#FFFFFF',
    border: '#E3E6EA',
    text: '#14181C',
    textMuted: '#5B6670',
    success: '#1E7F4F',
    warning: '#B7791F',
    danger: '#B42318',
    info: '#2563A8',
  },
  dark: {
    primary: '#5FB4C4',
    primaryForeground: '#0B1A1E',
    primarySubtle: '#12333A',
    accent: '#E2B35C',
    accentForeground: '#14181C',
    background: '#0E1215',
    surface: '#161B1F',
    border: '#2A3137',
    text: '#E8ECEF',
    textMuted: '#9AA5AE',
    success: '#4CC28A',
    warning: '#E3B04B',
    danger: '#F07068',
    info: '#6BA3E0',
  },
} as const;

export type ColorName = keyof (typeof colors)['light'];

export const radius = { sm: 6, md: 8, lg: 12, pill: 999 } as const;

/** 4-pt grid. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

export const fontSize = {
  web: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
  app: { xs: 13, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 },
} as const;

export const fontFamily = {
  sans: 'Inter',
  fallback: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Telugu', sans-serif",
} as const;

/** Minimum touch target in the app (docs/12 §8). */
export const touchTarget = 48;

export const tokens = { colors, radius, space, fontSize, fontFamily, touchTarget } as const;
