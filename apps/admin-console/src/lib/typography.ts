import type { TextRoleName } from '@tgs/design-tokens';

/**
 * Text role → Tailwind utility. Written out literally because Tailwind only generates classes it can
 * find as whole strings in source (a template like `text-${role}` would silently produce nothing).
 */
export const TEXT_ROLE_CLASS: Record<TextRoleName, string> = {
  display: 'text-display',
  pageTitle: 'text-page-title',
  sectionTitle: 'text-section-title',
  cardTitle: 'text-card-title',
  metric: 'text-metric tabular',
  metricSm: 'text-metric-sm tabular',
  bodyLg: 'text-body-lg',
  body: 'text-body',
  bodyStrong: 'text-body-strong',
  label: 'text-label',
  caption: 'text-caption',
  captionStrong: 'text-caption-strong',
  overline: 'text-overline uppercase tracking-wide',
  amount: 'text-amount tabular',
  amountLg: 'text-amount-lg tabular',
  mono: 'text-mono font-mono tabular',
};
