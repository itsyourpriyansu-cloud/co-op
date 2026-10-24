// Guards the "single source" promise: our foundation must equal Blend's FOUNDATION_THEME exactly.
// If Blend is upgraded and a value changes, this fails and tells you which token to re-mirror.
import { beforeAll, describe, expect, it } from 'vitest';
import { breakpoints, createBlendFoundation, dark, foundation, light, nativeTheme, palette, textRoles } from './index';

// Blend's token sources are TypeScript files inside node_modules. Loading them at runtime (Vitest
// transpiles them) keeps tsc from type-checking Blend's internals under our stricter settings.
const BLEND_LIB = '@juspay/blend-design-system/lib';
let blend: Record<string, unknown>;
let blendBreakpoints: unknown;

beforeAll(async () => {
  const theme = (await import(/* @vite-ignore */ `${BLEND_LIB}/tokens/theme.token.ts`)) as { default: Record<string, unknown> };
  const bp = (await import(/* @vite-ignore */ `${BLEND_LIB}/breakpoints/breakPoints.ts`)) as { BREAKPOINTS: unknown };
  blend = theme.default;
  blendBreakpoints = bp.BREAKPOINTS;
});

describe('foundation parity with Juspay Blend', () => {
  it.each(['colors', 'unit', 'border', 'shadows', 'opacity', 'zIndex'] as const)('%s match', (key) => {
    expect(foundation[key]).toEqual(blend[key]);
  });

  it('font tokens match (family is overridden only in the brand layer)', () => {
    expect(foundation.font).toEqual(blend.font);
  });

  it('breakpoints match', () => {
    expect(breakpoints).toEqual(blendBreakpoints);
  });
});

describe('brand layer', () => {
  it('keeps every foundation key and only swaps primary + font family', () => {
    const themed = createBlendFoundation();
    expect(Object.keys(themed).sort()).toEqual(Object.keys(foundation).sort());
    expect(themed.colors.gray).toBe(foundation.colors.gray);
    expect(themed.font.family.body).toContain('Inter');
    expect(Object.keys(themed.colors.primary)).toEqual(Object.keys(palette.primary));
  });
});

describe('semantic tier', () => {
  const isColor = (v: string) => /^#[0-9A-F]{6}$/i.test(v) || v.startsWith('rgba(');
  const flatten = (o: unknown): string[] =>
    typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(flatten) : Object.values(o as object).flatMap(flatten);
  const keys = (o: object): string[] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && !Array.isArray(v) ? keys(v as object).map((s) => `${k}.${s}`) : [k]));

  it('light and dark define the same roles', () => {
    expect(keys(dark)).toEqual(keys(light));
  });

  it('every semantic colour resolves to a real colour value', () => {
    expect(flatten(light).every(isColor)).toBe(true);
    expect(flatten(dark).every(isColor)).toBe(true);
  });

  it('text roles stay on Blend font steps', () => {
    const sizes = new Set<number>(Object.values(foundation.font.fontSize));
    for (const r of Object.values(textRoles)) expect(sizes.has(r.fontSize)).toBe(true);
  });

  it('native theme exposes the 48 dp touch target and numeric styles', () => {
    const t = nativeTheme();
    expect(t.touchTarget).toBe(48);
    expect(typeof t.text.body.fontSize).toBe('number');
  });
});
