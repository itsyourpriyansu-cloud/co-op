// Native mirror of Blend ButtonV2 (same prop contract: buttonType, size, subType, loading, slots).
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { color, radius, space } from '@/theme';
import { Text } from './Text';

export type ButtonType = 'primary' | 'secondary' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonSubType = 'default' | 'iconOnly' | 'inline';

export interface ButtonProps {
  text?: string;
  onPress?: () => void;
  buttonType?: ButtonType;
  size?: ButtonSize;
  subType?: ButtonSubType;
  loading?: boolean;
  disabled?: boolean;
  leftSlot?: LucideIcon;
  rightSlot?: LucideIcon;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };

const FILL: Record<ButtonType, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: color.brand.solid, pressed: color.brand.hover, fg: color.text.onBrand },
  secondary: { bg: color.bg.surface, pressed: color.bg.surfaceMuted, fg: color.text.primary, border: color.border.strong },
  danger: { bg: color.status.danger.solid, pressed: color.status.danger.fg, fg: color.text.onBrand },
  success: { bg: color.status.success.solid, pressed: color.status.success.fg, fg: color.text.onBrand },
};

export function Button({ text, onPress, buttonType = 'primary', size = 'md', subType = 'default', loading, disabled, leftSlot: Left, rightSlot: Right, fullWidth, accessibilityLabel, style }: ButtonProps) {
  const f = FILL[buttonType];
  const inline = subType === 'inline';
  const iconOnly = subType === 'iconOnly';
  const fg = inline ? (buttonType === 'danger' ? color.status.danger.fg : color.text.link) : f.fg;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        inline
          ? styles.inline
          : {
              height: HEIGHT[size],
              minWidth: iconOnly ? HEIGHT[size] : undefined,
              paddingHorizontal: iconOnly ? 0 : size === 'sm' ? space[6] : space[8],
              backgroundColor: pressed ? f.pressed : f.bg,
              borderColor: f.border ?? 'transparent',
              borderWidth: f.border ? 1 : 0,
            },
        fullWidth && styles.full,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {Left && <Left size={size === 'lg' ? 20 : 18} color={fg} strokeWidth={1.75} />}
          {!iconOnly && text ? (
            <Text role={size === 'lg' ? 'bodyStrong' : 'label'} style={{ color: fg }}>
              {text}
            </Text>
          ) : null}
          {Right && <Right size={size === 'lg' ? 20 : 18} color={fg} strokeWidth={1.75} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  inline: { minHeight: 32, paddingHorizontal: 0, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  full: { alignSelf: 'stretch' },
  inactive: { opacity: 0.5 },
});
