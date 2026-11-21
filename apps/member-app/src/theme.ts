// TGSECCSL mobile design system (D-138, docs/25): Astryx tokens (astryx.atmeta.com) dressed in the
// seal's navy and gold. The only source of colour, type, spacing, radius, shadow and motion in the app.
// No React Native imports here, so `theme.test.ts` can check contrast under plain Vitest.

/** Seal colours (assets/logo/tgseccs-logo.svg). Gold is never text on a light surface (2.26:1). */
const navy = '#003471';
const navyPressed = '#013B82';
const gold = '#D4A547';

export const color = {
  background: { body: '#F1F1F1', surface: '#FFFFFF', muted: '#F1F1F1', inverted: '#0A1317' },
  text: {
    primary: '#0A1317',
    secondary: '#474747',
    disabled: '#919191',
    link: navy,
    onAccent: '#FFFFFF',
    /** Secondary text on a navy surface (8:1). */
    onAccentMuted: '#C7D3E6',
    inverse: '#FFFFFF',
  },
  icon: { primary: '#0A1317', secondary: '#6A6A6A' },
  /** The one accent: primary actions, links, focus, selection, progress. */
  accent: navy,
  accentPressed: navyPressed,
  accentMuted: '#E6EDF7',
  /** A tile inside a navy card: white text stays above 9:1. */
  accentTile: 'rgba(255,255,255,0.10)',
  /** Brand highlight: one moment per screen (active tab, hero ring, done stage). */
  gold,
  goldText: '#8A6420',
  goldMuted: '#FBF4E4',
  border: '#00000014',
  borderEmphasized: '#D4D4D4',
  /** Edge of an empty entry box that has no other outline (OTP boxes): WCAG 1.4.11, 3:1 on body and surface. */
  borderInput: '#888888',
  overlay: '#00000080',
  overlayPressed: '#0000000F',
  skeleton: '#E2E2E2',
  track: '#E1E5EA',
  /** Astryx status colours. `tint` is lighter than Astryx's muted so status text on it passes AA. */
  status: {
    info: { solid: '#0067CE', onSolid: '#FFFFFF', text: '#0067CE', tint: '#E8F1FD', border: '#B9D7FF' },
    success: { solid: '#198100', onSolid: '#FFFFFF', text: '#2A7230', tint: '#EDF6EC', border: '#BCE0BB' },
    warning: { solid: '#FFCE2F', onSolid: '#111111', text: '#836700', tint: '#FDF5DC', border: '#FAE19E' },
    error: { solid: '#C9303A', onSolid: '#FFFFFF', text: '#C0262C', tint: '#FDECEA', border: '#FFC4BE' },
    neutral: { solid: '#6A6A6A', onSolid: '#FFFFFF', text: '#474747', tint: '#F1F1F1', border: '#D4D4D4' },
    approval: { solid: '#6B4FB3', onSolid: '#FFFFFF', text: '#6B4FB3', tint: '#F1ECFA', border: '#D9CCF2' },
  },
  money: { credit: '#2A7230', debit: '#C0262C' },
  /**
   * D-139 glass hero (member home, profile, staff home): deep navy gradient lit by a gold glow, with
   * frosted tiles on it. `solid` is the start colour, the worst case for text contrast.
   */
  hero: {
    solid: '#063B76',
    gradient: 'linear-gradient(155deg, #063B76 0%, #003471 50%, #001F45 100%)',
    glow: 'radial-gradient(circle, rgba(212,165,71,0.40) 0%, rgba(212,165,71,0) 70%)',
    ring: 'rgba(212,165,71,0.55)',
    glass: 'rgba(255,255,255,0.08)',
    glassBorder: 'rgba(255,255,255,0.16)',
    glassEdge: 'inset 0px 1px 0px rgba(255,255,255,0.14)',
  },
} as const;

export type StatusName = keyof typeof color.status;

/** Figtree (Astryx's family), one face per weight: Android does not synthesise weights. */
export const FONT = {
  normal: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
} as const;
export type FontWeight = keyof typeof FONT;

interface TypeSpec {
  fontSize: number;
  lineHeight: number;
  weight: FontWeight;
  letterSpacing?: number;
  uppercase?: boolean;
  tabular?: boolean;
}

/**
 * Astryx semantic type, scale round(16 × 1.2^step): Astryx's own `scale.base` knob set to 16 for a phone.
 * Line heights on a 4 px grid (≈1.5 below 20 px, ≈1.4 to 31 px, ≈1.25 above).
 */
export const type = {
  'display-1': { fontSize: 48, lineHeight: 56, weight: 'normal', letterSpacing: -0.5 },
  'display-2': { fontSize: 40, lineHeight: 48, weight: 'normal', letterSpacing: -0.4 },
  'display-3': { fontSize: 33, lineHeight: 40, weight: 'semibold', letterSpacing: -0.3, tabular: true },
  h1: { fontSize: 28, lineHeight: 36, weight: 'semibold', letterSpacing: -0.2 },
  h2: { fontSize: 23, lineHeight: 32, weight: 'semibold' },
  h3: { fontSize: 19, lineHeight: 28, weight: 'semibold' },
  h4: { fontSize: 16, lineHeight: 24, weight: 'semibold' },
  large: { fontSize: 19, lineHeight: 28, weight: 'semibold' },
  body: { fontSize: 16, lineHeight: 24, weight: 'normal' },
  label: { fontSize: 16, lineHeight: 24, weight: 'medium' },
  supporting: { fontSize: 13, lineHeight: 20, weight: 'normal' },
  overline: { fontSize: 11, lineHeight: 16, weight: 'semibold', letterSpacing: 0.6, uppercase: true },
  amount: { fontSize: 16, lineHeight: 24, weight: 'semibold', tabular: true },
} as const satisfies Record<string, TypeSpec>;
export type TypeName = keyof typeof type;

/** RN text style for an Astryx type, with an optional weight override (Astryx `Text weight`). */
export function textStyle(name: TypeName, weight?: FontWeight) {
  const t: TypeSpec = type[name];
  return {
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    fontFamily: FONT[weight ?? t.weight],
    ...(t.letterSpacing ? { letterSpacing: t.letterSpacing } : {}),
    ...(t.uppercase ? { textTransform: 'uppercase' as const } : {}),
    // Figures line up in a column, as in a ledger.
    ...(t.tabular ? { fontVariant: ['tabular-nums' as const] } : {}),
  };
}

/** Astryx --spacing-N: 4 px steps with half steps. */
export const spacing = { 0: 0, 0.5: 2, 1: 4, 1.5: 6, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48 } as const;

/** Astryx shape: inner (inside cards), element (controls), container (cards), page (sheets). */
export const radius = { inner: 8, element: 12, container: 16, page: 28, full: 9999 } as const;

/** Only floating things cast a shadow; cards separate by surface step + border (Astryx). */
export const shadow = {
  low: '0px 1px 2px rgba(0,0,0,0.06)',
  med: '0px 4px 12px rgba(0,0,0,0.10)',
  high: '0px 12px 32px rgba(0,0,0,0.15)',
} as const;

/** Astryx motion tokens (ms). Curves are cubic-bezier control points; `ui/motion.ts` turns them into Easing. */
export const motion = {
  duration: { fastMin: 130, fast: 175, fastMax: 230, mediumMin: 310, medium: 410, mediumMax: 550, slowLoop: 1300, exit: 175, reduced: 200 },
  curve: { standard: [0.24, 1, 0.4, 1], exit: [0.3, 0, 0.6, 0.6] },
  /** Anything a finger touches springs from its live value. */
  spring: { stiffness: 400, damping: 30, mass: 1 },
  /** Entrance stagger: first blocks of a screen, 40 ms apart, 8 px rise. */
  stagger: { step: 40, max: 6, rise: 8 },
} as const;

export const touchTarget = 48;
export const layout = { contentMaxWidth: 480, gutter: spacing[4] } as const;
