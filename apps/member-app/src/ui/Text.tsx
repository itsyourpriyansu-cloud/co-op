// Astryx Text: a semantic `type` (docs/25 §4.2), an optional `weight`, and a semantic `tone`.
import { Text as RNText, type TextProps } from 'react-native';
import { color, textStyle, type FontWeight, type TypeName } from '@/theme';

export type TextTone = 'primary' | 'secondary' | 'disabled' | 'inverse' | 'link' | 'onAccent' | 'onAccentMuted' | 'gold' | 'success' | 'warning' | 'error' | 'credit' | 'debit';

const TONE: Record<TextTone, string> = {
  primary: color.text.primary,
  secondary: color.text.secondary,
  disabled: color.text.disabled,
  inverse: color.text.inverse,
  link: color.text.link,
  onAccent: color.text.onAccent,
  onAccentMuted: color.text.onAccentMuted,
  gold: color.goldText,
  success: color.status.success.text,
  warning: color.status.warning.text,
  error: color.status.error.text,
  credit: color.money.credit,
  debit: color.money.debit,
};

/** The only text component. */
export function Text({ type = 'body', weight, tone = 'primary', style, ...props }: TextProps & { type?: TypeName; weight?: FontWeight; tone?: TextTone }) {
  return <RNText {...props} style={[textStyle(type, weight), { color: TONE[tone] }, style]} />;
}
