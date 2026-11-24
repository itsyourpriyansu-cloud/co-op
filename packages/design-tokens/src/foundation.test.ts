// Guards the "single source" promise: our foundation must equal Blend's FOUNDATION_THEME exactly.
// If Blend is upgraded and a value changes, this fails and tells you which token to re-mirror.
import { beforeAll, describe, expect, it } from 'vitest';
import { brand, breakpoints, createBlendFoundation, dark, foundation, light, nativeTheme, palette, textRoles } from './index';

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
    expect(themed.font.family.body).toContain('Figtree');
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

// D-150: the console's Astryx colours keep WCAG AA (4.5:1) for every text pair, in both themes.
describe('contrast (WCAG AA)', () => {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x! + 0.05) / (y! + 0.05);
  };
  for (const [name, t] of [['light', light], ['dark', dark]] as const) {
    it(`${name}: text, links, brand, gold, money and status text pass 4.5:1`, () => {
      const pairs: Array<[string, string, string]> = [];
      for (const bg of ['canvas', 'surface', 'surfaceMuted'] as const)
        for (const fg of ['primary', 'secondary', 'tertiary'] as const) pairs.push([`text.${fg} on ${bg}`, t.text[fg], t.bg[bg]]);
      pairs.push(['link on surface', t.text.link, t.bg.surface], ['onBrand on brand', t.text.onBrand, t.brand.solid], ['brand.text on brand.subtle', t.brand.text, t.brand.subtle]);
      pairs.push(['gold.text on gold.muted', t.gold.text, t.gold.muted], ['gold.text on surface', t.gold.text, t.bg.surface]);
      pairs.push(['credit on surface', t.money.credit, t.bg.surface], ['debit on surface', t.money.debit, t.bg.surface]);
      for (const [s, r] of Object.entries(t.status)) pairs.push([`${s}.fg on ${s}.bg`, r.fg, r.bg]);
      const failing = pairs.filter(([, fg, bg]) => ratio(fg, bg) < 4.5).map(([l, fg, bg]) => `${l} ${ratio(fg, bg).toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }
  it('dark Blend scale: link / tag text (400) on dark surfaces and white on button fills (500, 600)', () => {
    const d = brand.primaryScaleDark;
    const pairs: Array<[string, string]> = [[d[400], dark.bg.surface], [d[400], d[950]], [d[300], d[900]], ['#FFFFFF', d[500]], ['#FFFFFF', d[600]]];
    expect(pairs.filter(([fg, bg]) => ratio(fg, bg) < 4.5)).toEqual([]);
  });
});
