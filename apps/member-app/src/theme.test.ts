// D-138: every text-on-surface pair the mobile kit draws must pass WCAG AA (4.5:1), so a colour tweak
// cannot quietly break the a11y-phone suite.
import { describe, expect, it } from 'vitest';
import { color } from './theme';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const { background: bg, text } = color;
const pairs: Array<[string, string, string]> = [
  ['text.primary on body', text.primary, bg.body],
  ['text.secondary on body', text.secondary, bg.body],
  ['text.secondary on surface', text.secondary, bg.surface],
  ['link on surface', text.link, bg.surface],
  ['link on body', text.link, bg.body],
  ['onAccent on accent', text.onAccent, color.accent],
  ['onAccent on accentPressed', text.onAccent, color.accentPressed],
  ['onAccentMuted on accent', text.onAccentMuted, color.accent],
  ['accent on accentMuted', color.accent, color.accentMuted],
  ['goldText on surface', color.goldText, bg.surface],
  ['goldText on goldMuted', color.goldText, color.goldMuted],
  ['gold on accent', color.gold, color.accent],
  ['money.credit on surface', color.money.credit, bg.surface],
  ['money.debit on surface', color.money.debit, bg.surface],
  ...Object.entries(color.status).flatMap(([name, s]): Array<[string, string, string]> => [
    [`${name} text on tint`, s.text, s.tint],
    [`${name} text on surface`, s.text, bg.surface],
    [`${name} onSolid on solid`, s.onSolid, s.solid],
  ]),
];

describe('mobile theme contrast (D-138)', () => {
  it.each(pairs)('%s ≥ 4.5:1', (_name, fg, back) => {
    expect(contrast(fg, back)).toBeGreaterThanOrEqual(4.5);
  });
});
