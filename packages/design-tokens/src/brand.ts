// BRAND — the only place TGSECCSL differs from stock Blend.
// Until the society shares its identity (Q-008) the app wears Blend's own palette,
// so it looks and feels like a Juspay product (D-047). To rebrand: replace `primaryScale`
// with an 11-step scale (50…950) and run `npm run tokens`. Every component follows.
import { palette } from './foundation';

export const brand = {
  appName: 'TGSECCSL',
  consoleName: 'TGSECCSL Admin',
  legalName: 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.',
  registrationNo: 'P-929',
  /** Full 50–950 scale: Blend components read most steps (focus rings 200, fills 500/600, tints 50/100). */
  primaryScale: palette.primary,
  /**
   * Blend ships no font files and names "InterDisplay". We self-host Inter (variable, with the
   * optical-size axis, which renders the Display cut at large sizes) and point every family at it.
   */
  fontFamily: {
    sans: "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Telugu', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
    /** React Native: font family names registered with expo-font (system font until then). */
    native: { sans: undefined as string | undefined, mono: 'monospace' },
  },
} as const;
