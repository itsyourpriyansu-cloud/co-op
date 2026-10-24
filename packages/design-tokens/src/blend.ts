// TIER 3 (web) — the Blend theme for the Admin Console. Pass to <ThemeProvider foundationTokens>.
// It is Blend's own FOUNDATION_THEME with only the brand deltas applied (brand.ts), so every Blend
// component token (getButtonV2Tokens(foundation) …) is derived from our single source.
import { brand } from './brand';
import { foundation } from './foundation';

export function createBlendFoundation() {
  return {
    ...foundation,
    colors: { ...foundation.colors, primary: brand.primaryScale },
    font: {
      ...foundation.font,
      family: { display: brand.fontFamily.sans, body: brand.fontFamily.sans, heading: brand.fontFamily.sans, mono: brand.fontFamily.mono },
    },
  };
}

export type BlendFoundation = ReturnType<typeof createBlendFoundation>;
