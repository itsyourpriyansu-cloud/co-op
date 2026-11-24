// Space, shape, depth, motion and layout roles — all expressed as Blend foundation steps (numbers in px).
import { breakpoints } from './foundation';

/** 4-pt rhythm using Blend unit steps. */
export const space = {
  0: 0, 1: 2, 2: 4, 3: 6, 4: 8, 5: 10, 6: 12, 8: 16, 10: 20, 12: 24, 14: 28, 16: 32, 20: 40, 24: 48, 28: 56, 32: 64,
} as const;

export const spacing = {
  /** Padding inside cards/drawers/sheets. */
  inset: { sm: space[6], md: space[8], lg: space[12] },
  /** Vertical gap between stacked elements. */
  stack: { xs: space[2], sm: space[4], md: space[6], lg: space[8], xl: space[12], '2xl': space[16] },
  /** Horizontal gap between inline elements. */
  inline: { xs: space[2], sm: space[4], md: space[6], lg: space[8] },
  /** Page side gutter. */
  gutter: { console: space[12], app: space[8] },
} as const;

/** Radii by role, Astryx shape as on the phone (D-150): inner 8, controls 12, cards 16. */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  control: 12,
  card: 16,
  sheet: 16,
  modal: 16,
  pill: 9999,
} as const;

export const borderWidth = { hairline: 1, focus: 2, emphasis: 1.5 } as const;

/**
 * Elevation, Astryx rule as on the phone (D-150): cards separate by surface step + hairline border and
 * cast no shadow; only floating things do (menus, drawers, the sticky save bar). Native: native.ts.
 */
export const elevation = {
  flat: 'none',
  raised: 'none',
  card: 'none',
  hover: '0px 1px 2px rgba(0,0,0,0.06)',
  dropdown: '0px 4px 12px rgba(0,0,0,0.10)',
  drawer: '0px 12px 32px rgba(0,0,0,0.15)',
  modal: '0px 12px 32px rgba(0,0,0,0.15)',
} as const;

/** Astryx motion as on the phone (D-150): fast 130/175/230, medium 310/410/550, exit 175. */
export const motion = {
  duration: { instant: 130, fast: 175, base: 230, slow: 410, deliberate: 550 },
  easing: {
    standard: 'cubic-bezier(0.24, 1, 0.4, 1)',
    enter: 'cubic-bezier(0.24, 1, 0.4, 1)',
    exit: 'cubic-bezier(0.3, 0, 0.6, 0.6)',
  },
} as const;

export const layers = { base: 0, sticky: 10, header: 99, dropdown: 1000, drawer: 1100, modal: 1200, toast: 9999 } as const;

export const layout = {
  breakpoints: { ...breakpoints, md: 768, xl: 1280, '2xl': 1440 },
  console: {
    topbarHeight: 48,
    contentMaxWidth: 1440,
    drawerWidth: 480,
    tableRow: { comfortable: 52, compact: 40 },
  },
  app: {
    tabBarHeight: 64,
    headerHeight: 56,
    contentMaxWidth: 480,
  },
  /** Minimum touch target on Android (docs/12 §8). Web minimum is 24 (WCAG 2.2 SC 2.5.8). */
  touchTarget: { app: 48, web: 24 },
} as const;
