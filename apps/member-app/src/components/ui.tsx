// Base UI kit for the Member App (docs/12 §7). Every touchable is ≥ 48 dp (docs/12 §8).
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { c, fs, radius, space, touchTarget } from '@/theme';

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, style]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'caption';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[styles.text, textStyles[variant], style]} />;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  const fg =
    variant === 'primary' || variant === 'danger'
      ? c.primaryForeground
      : variant === 'outline'
        ? c.text
        : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: c.primary },
        variant === 'danger' && { backgroundColor: c.danger },
        variant === 'outline' && {
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
        },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : Icon ? (
        <Icon size={20} color={fg} strokeWidth={1.75} />
      ) : null}
      <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A module whose screens arrive in a later milestone. */
export function ComingSoon({
  icon: Icon,
  title,
  body,
  milestone,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  milestone: string;
}) {
  return (
    <Card style={styles.comingSoon}>
      <View style={styles.iconCircle}>
        <Icon size={28} color={c.primary} strokeWidth={1.75} />
      </View>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      <AppText variant="muted" style={styles.center}>
        {body}
      </AppText>
      <View style={styles.pill}>
        <AppText variant="caption" style={{ color: c.primary }}>
          Arrives in {milestone}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  content: { padding: space[4], gap: space[4] },
  fill: { flex: 1 },
  text: { color: c.text, fontSize: fs.md },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  buttonLabel: { fontSize: fs.md, fontWeight: '600' },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    padding: space[4],
  },
  comingSoon: { alignItems: 'center', gap: space[2], paddingVertical: space[8] },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  center: { textAlign: 'center' },
  pill: {
    marginTop: space[2],
    backgroundColor: c.primarySubtle,
    borderRadius: radius.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
});

const textStyles = StyleSheet.create({
  title: { fontSize: fs['2xl'], fontWeight: '700' },
  heading: { fontSize: fs.lg, fontWeight: '600' },
  body: { fontSize: fs.md },
  muted: { fontSize: fs.sm, color: c.textMuted },
  caption: { fontSize: fs.xs, color: c.textMuted, fontWeight: '500' },
});
