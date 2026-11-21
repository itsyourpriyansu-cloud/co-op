// Astryx Button / IconButton / Link (docs/25 §5). Press = spring scale + pressed fill; primary press taps
// a light haptic; loading swaps the label for a spinner without changing the button's size.
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { color, radius, spacing, touchTarget } from '@/theme';
import { haptic, usePressScale } from './motion';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Touch heights beat Astryx's desktop 28–36: 40 / 48 / 56. */
const HEIGHT: Record<ButtonSize, number> = { sm: 40, md: touchTarget, lg: 56 };

const FILL: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: color.accent, pressed: color.accentPressed, fg: color.text.onAccent },
  secondary: { bg: color.background.surface, pressed: color.background.muted, fg: color.text.primary, border: color.borderEmphasized },
  ghost: { bg: 'transparent', pressed: color.overlayPressed, fg: color.accent },
  destructive: { bg: color.status.error.solid, pressed: color.status.error.text, fg: color.status.error.onSolid },
};

interface CommonProps {
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

function useButtonPress(onPress: (() => void) | undefined, tap: boolean, scaleTo = 0.97) {
  const [pressed, setPressed] = useState(false);
  const { scaleStyle, pressHandlers } = usePressScale(scaleTo);
  return {
    pressed,
    scaleStyle,
    handlers: {
      onPressIn: () => {
        setPressed(true);
        pressHandlers.onPressIn();
      },
      onPressOut: () => {
        setPressed(false);
        pressHandlers.onPressOut();
      },
      onPress: () => {
        if (tap) haptic.tap();
        onPress?.();
      },
    },
  };
}

export function Button({ label, variant = 'primary', size = 'md', icon: Icon, iconEnd: IconEnd, fullWidth, onPress, loading, disabled, accessibilityLabel, style }: CommonProps & { label: string; variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; iconEnd?: LucideIcon; fullWidth?: boolean }) {
  const f = FILL[variant];
  const inactive = disabled || loading;
  const { pressed, scaleStyle, handlers } = useButtonPress(onPress, variant === 'primary');
  const iconSize = size === 'lg' ? 20 : 18;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      {...handlers}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? spacing[3] : spacing[5],
          backgroundColor: pressed ? f.pressed : f.bg,
          borderColor: f.border ?? 'transparent',
          borderWidth: f.border ? 1 : 0,
        },
        fullWidth && styles.full,
        inactive && styles.inactive,
        style,
        scaleStyle,
      ]}
    >
      {/* The label keeps its space while loading, so the button never changes width. */}
      <View style={[styles.row, loading && styles.hidden]}>
        {Icon && <Icon size={iconSize} color={f.fg} strokeWidth={1.75} />}
        <Text type="label" weight="semibold" style={{ color: f.fg }} numberOfLines={1}>
          {label}
        </Text>
        {IconEnd && <IconEnd size={iconSize} color={f.fg} strokeWidth={1.75} />}
      </View>
      {loading ? <ActivityIndicator color={f.fg} style={StyleSheet.absoluteFill} /> : null}
    </AnimatedPressable>
  );
}

/** Square icon-only action. `accessibilityLabel` is required: there is no visible text. */
export function IconButton({ icon: Icon, variant = 'ghost', size = 'md', onPress, loading, disabled, accessibilityLabel, style }: CommonProps & { icon: LucideIcon; variant?: ButtonVariant; size?: ButtonSize; accessibilityLabel: string }) {
  const f = FILL[variant];
  const inactive = disabled || loading;
  const { pressed, scaleStyle, handlers } = useButtonPress(onPress, false, 0.92);
  const s = HEIGHT[size];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={size === 'sm' ? 4 : 0}
      {...handlers}
      style={[styles.base, { width: s, height: s, backgroundColor: pressed ? f.pressed : f.bg, borderColor: f.border ?? 'transparent', borderWidth: f.border ? 1 : 0 }, inactive && styles.inactive, style, scaleStyle]}
    >
      {loading ? <ActivityIndicator color={f.fg} /> : <Icon size={size === 'lg' ? 22 : 20} color={f.fg} strokeWidth={1.75} />}
    </AnimatedPressable>
  );
}

/** Inline text action inside content ("Show all", "Remove"). Keeps the button role the e2e suite finds. */
export function Link({ label, destructive, icon: Icon, iconEnd: IconEnd, onPress, loading, disabled, accessibilityLabel, style }: CommonProps & { label: string; destructive?: boolean; icon?: LucideIcon; iconEnd?: LucideIcon }) {
  const fg = destructive ? color.status.error.text : color.text.link;
  const inactive = disabled || loading;
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={8}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      style={[styles.link, pressed && styles.linkPressed, inactive && styles.inactive, style]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {Icon && <Icon size={18} color={fg} strokeWidth={1.75} />}
          <Text type="label" weight="semibold" style={{ color: fg }}>
            {label}
          </Text>
          {IconEnd && <IconEnd size={18} color={fg} strokeWidth={1.75} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.element, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  hidden: { opacity: 0 },
  full: { alignSelf: 'stretch' },
  inactive: { opacity: 0.45 },
  link: { minHeight: 32, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: radius.inner },
  linkPressed: { opacity: 0.6 },
});
