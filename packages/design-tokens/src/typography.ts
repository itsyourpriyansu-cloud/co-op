// Typography roles, built only from Blend's font scale (foundation.font.size).
// Console base = body.md 14/20 (Blend default). Member App base = body.lg 16/24 (docs/12 §4).
import { font } from './foundation';

export interface TextRole {
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 500 | 600 | 700;
  letterSpacing?: number;
  /** Money, counts, IDs: digits line up in columns. */
  tabular?: boolean;
  uppercase?: boolean;
}

const s = font.size;
const role = (g: { fontSize: number; lineHeight: number }, fontWeight: TextRole['fontWeight'], extra: Partial<TextRole> = {}): TextRole => ({
  fontSize: g.fontSize,
  lineHeight: g.lineHeight,
  fontWeight,
  ...extra,
});

export const textRoles = {
  /** Login hero, celebration numbers ("Welcome, General No. 1601"). */
  display: role(s.heading['2xl'], 600),
  /** One per page: the PageHeader title. */
  pageTitle: role(s.heading.lg, 600),
  /** Section headers inside a page. */
  sectionTitle: role(s.heading.sm, 600),
  /** Card / drawer / list-group titles. */
  cardTitle: role(s.body.lg, 600),
  /** KPI value (StatCard-like). */
  metric: role(s.heading.xl, 600, { tabular: true }),
  /** Secondary KPI, amounts in summaries. */
  metricSm: role(s.heading.md, 600, { tabular: true }),
  bodyLg: role(s.body.lg, 400),
  body: role(s.body.md, 400),
  bodyStrong: role(s.body.md, 500),
  label: role(s.body.md, 500),
  caption: role(s.body.sm, 400),
  captionStrong: role(s.body.sm, 500),
  overline: role(s.body.xs, 600, { letterSpacing: 0.6, uppercase: true }),
  amount: role(s.body.md, 500, { tabular: true }),
  amountLg: role(s.body.lg, 600, { tabular: true }),
  mono: role(s.code.lg, 400, { tabular: true }),
} as const satisfies Record<string, TextRole>;

export type TextRoleName = keyof typeof textRoles;

/** Member App: one step larger for readability on phones (16 sp body). */
export const nativeTextRoles: Record<TextRoleName, TextRole> = {
  ...textRoles,
  pageTitle: role(s.heading.lg, 700),
  sectionTitle: role(s.heading.sm, 600),
  cardTitle: role(s.body.lg, 600),
  body: role(s.body.lg, 400),
  bodyStrong: role(s.body.lg, 500),
  label: role(s.body.md, 500),
  caption: role(s.body.md, 400),
  captionStrong: role(s.body.md, 500),
  overline: role(s.body.sm, 600, { letterSpacing: 0.6, uppercase: true }),
  amount: role(s.body.lg, 600, { tabular: true }),
  amountLg: role(s.heading.md, 700, { tabular: true }),
};
