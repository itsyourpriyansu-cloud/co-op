// BRAND — the only place TGSECCSL differs from stock Blend.
// D-150: the console wears the phone's look (D-138, docs/25): the seal's navy as the one accent, gold as
// the 10 % highlight, Figtree. `primaryScale` is an 11-step scale with the seal navy #003471 on step 500,
// the step Blend fills primary buttons with; 50–400 are its tints, 600–950 its shades.
export const brand = {
  appName: 'TGSECCSL',
  consoleName: 'TGSECCSL Admin',
  legalName: 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.',
  registrationNo: 'P-929',
  /** Full 50–950 scale: Blend components read most steps (focus rings 200, fills 500/600, tints 50/100). */
  primaryScale: {
    50: '#E6EDF7', 100: '#CCDAEE', 200: '#A3BCE0', 300: '#6F93C8', 400: '#2F5E9E', 500: '#003471',
    600: '#002D62', 700: '#002654', 800: '#001F45', 900: '#001836', 950: '#001026',
  },
  /**
   * Dark theme: Blend writes inline links and tag text in step 400 on step 950, and fills buttons with
   * 600→500 under white text. So 300–400 are light navies (7:1 on the dark surfaces) and 500–600 stay
   * dark enough for white text (6.6:1).
   */
  primaryScaleDark: {
    50: '#0E2340', 100: '#13305A', 200: '#1D4174', 300: '#A3BCE0', 400: '#8DACD9', 500: '#2F5E9E',
    600: '#264F87', 700: '#1D4174', 800: '#173561', 900: '#0E2340', 950: '#001026',
  },
  /** Seal gold (phone `color.gold`): marks only, never text on a light surface (2.26:1). */
  gold: { solid: '#D4A547', text: '#8A6420', muted: '#FBF4E4' },
  /**
   * D-139 glass hero, as on the phone (theme.ts `color.hero`): deep navy lit by a gold glow, frosted tiles.
   * Also the dark navigation rail (D-150). White text on `solid` is 11:1; `onMuted` 8:1.
   */
  hero: {
    solid: '#063B76',
    gradient: 'linear-gradient(155deg, #063B76 0%, #003471 50%, #001F45 100%)',
    glow: 'radial-gradient(circle, rgba(212,165,71,0.40) 0%, rgba(212,165,71,0) 70%)',
    ring: 'rgba(212,165,71,0.55)',
    glass: 'rgba(255,255,255,0.08)',
    glassHover: 'rgba(255,255,255,0.14)',
    glassBorder: 'rgba(255,255,255,0.16)',
    glassEdge: 'inset 0px 1px 0px rgba(255,255,255,0.14)',
    on: '#FFFFFF',
    onMuted: '#C7D3E6',
  },
  /** Figtree, the phone's family (Astryx), self-hosted with @fontsource-variable/figtree (D-150). */
  fontFamily: {
    sans: "'Figtree Variable', 'Figtree', system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Telugu', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace",
    /** React Native: font family names registered with expo-font (system font until then). */
    native: { sans: undefined as string | undefined, mono: 'monospace' },
  },
} as const;
