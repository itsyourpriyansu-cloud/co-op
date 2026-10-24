// @tgs/design-tokens — the single source of truth for TGSECCSL's visual language (docs/18).
//
//   TIER 1  foundation.ts  Blend FOUNDATION_THEME mirror (palette, font, unit, border, shadows…)
//   BRAND   brand.ts       the only deltas from stock Blend (name, primary scale, font family)
//   TIER 2  semantic.ts    roles screens use (bg/text/border/brand/status/money/chart), light + dark
//           typography.ts  text roles · layout.ts  space, radius, elevation, motion, layout
//   TIER 3  blend.ts       Blend ThemeProvider foundation (Admin Console)
//           native.ts      React Native theme (Member App)
//           css/tokens.css CSS variables (generated: npm run tokens)
//
// Rule: screens use TIER 2 roles only. Raw hex or px in feature code is a lint failure (docs/18 §9).

export * from './foundation';
export * from './brand';
export * from './semantic';
export * from './typography';
export * from './layout';
export * from './blend';
export * from './native';
export * from './status';
