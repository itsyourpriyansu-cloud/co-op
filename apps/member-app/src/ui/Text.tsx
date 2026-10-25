import { Text as RNText, type TextProps } from 'react-native';
import type { TextRoleName } from '@tgs/design-tokens';
import { color, textStyle } from '@/theme';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'disabled' | 'inverse' | 'link' | 'onBrand' | 'success' | 'warning' | 'danger' | 'credit' | 'debit';

const TONE: Record<TextTone, string> = {
  primary: color.text.primary,
  secondary: color.text.secondary,
  tertiary: color.text.tertiary,
  disabled: color.text.disabled,
  inverse: color.text.inverse,
  link: color.text.link,
  onBrand: color.text.onBrand,
  success: color.status.success.fg,
  warning: color.status.warning.fg,
  danger: color.status.danger.fg,
  credit: color.money.credit,
  debit: color.money.debit,
};

/** The only text component: a typography role (docs/18 §4) + a semantic tone. */
export function Text({ role = 'body', tone = 'primary', style, ...props }: Omit<TextProps, 'role'> & { role?: TextRoleName; tone?: TextTone }) {
  return <RNText {...props} style={[textStyle(role), { color: TONE[tone] }, style]} />;
}
