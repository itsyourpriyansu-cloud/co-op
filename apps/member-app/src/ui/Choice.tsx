// Astryx choice controls (docs/25 §5): SelectableCard, YesNo, CheckboxInput, SegmentedControl,
// MonthPicker, NumberInput. Selection cross-fades in over `fast`, presses spring, a new choice ticks a haptic.
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { color, motion, radius, shadow, spacing, touchTarget } from '@/theme';
import { haptic, useMotionMode, usePressScale, useToggle } from './motion';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** One radio-style option button; the selected fill fades in as a layer over the resting border. */
function OptionButton({ label, on, onPress, disabled, error, accessibilityLabel, style }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; error?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const v = useToggle(on);
  const { scaleStyle, pressHandlers } = usePressScale(0.96);
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={() => {
        if (!on) haptic.select();
        onPress();
      }}
      {...pressHandlers}
      style={[styles.opt, error && !on && styles.optError, disabled && styles.off, style, scaleStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.optOn, { opacity: v }]} />
      <Text type="label" weight={on ? 'semibold' : 'medium'} style={{ color: on ? color.accent : color.text.primary }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Astryx SelectableCard with a radio mark; the dot scales in when chosen. */
export function SelectableCard({ title, description, icon: Icon, selected, onPress, right }: { title: string; description?: string; icon?: LucideIcon; selected?: boolean; onPress: () => void; right?: ReactNode }) {
  const v = useToggle(!!selected);
  const { scaleStyle, pressHandlers } = usePressScale(0.98);
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      aria-checked={!!selected}
      onPress={() => {
        if (!selected) haptic.select();
        onPress();
      }}
      {...pressHandlers}
      style={[styles.card, scaleStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.cardOn, { opacity: v }]} />
      {Icon ? (
        <View style={[styles.icon, selected && { backgroundColor: color.background.surface }]}>
          <Icon size={22} color={color.accent} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <Text type="h4">{title}</Text>
        {description ? (
          <Text type="supporting" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <View style={[styles.radio, selected && styles.radioOn]}>
          <Animated.View style={[styles.dot, { opacity: v, transform: [{ scale: v }] }]} />
        </View>
      )}
    </AnimatedPressable>
  );
}

/** One eligibility question with explicit Yes / No buttons (no ambiguous toggles). */
export function YesNo({ question, why, value, onChange }: { question: string; why?: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.yn}>
      <Text type="h4">{question}</Text>
      {why ? (
        <Text type="supporting" tone="secondary">
          {why}
        </Text>
      ) : null}
      <View style={styles.optRow} accessibilityRole="radiogroup">
        {[true, false].map((v) => (
          <OptionButton key={String(v)} label={v ? 'Yes' : 'No'} on={value === v} onPress={() => onChange(v)} style={styles.grow} />
        ))}
      </View>
    </View>
  );
}

/** Astryx CheckboxInput: the fill fades in and the tick springs up. */
export function CheckboxInput({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const v = useToggle(checked);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={() => {
        haptic.select();
        onChange(!checked);
      }}
      style={styles.cb}
    >
      <View style={styles.box}>
        <Animated.View style={[styles.boxOn, { opacity: v }]}>
          <Animated.View style={{ transform: [{ scale: v }] }}>
            <Check size={16} color={color.text.onAccent} strokeWidth={3} />
          </Animated.View>
        </Animated.View>
      </View>
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <Text type="body" weight="medium">
          {label}
        </Text>
        {description ? (
          <Text type="supporting" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** One segment: the white thumb fades in under the label when chosen. */
function Segment({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const v = useToggle(on);
  const { scaleStyle, pressHandlers } = usePressScale(0.96);
  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={() => {
        if (!on) haptic.select();
        onPress();
      }}
      {...pressHandlers}
      hitSlop={4}
      style={[styles.seg, scaleStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.segOn, { opacity: v }]} />
      <Text type="label" weight={on ? 'semibold' : 'medium'} style={{ color: on ? color.accent : color.text.secondary, textAlign: 'center' }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Astryx SegmentedControl: short, mutually exclusive options on one track (gender, list filters).
 * `hideLabel` keeps the label for screen readers only, for a filter whose options say it all.
 */
export function SegmentedControl<T extends string>({ label, hideLabel, value, options, onChange, error }: { label: string; hideLabel?: boolean; value?: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; error?: string }) {
  return (
    <View style={{ gap: spacing[1.5] }}>
      {hideLabel ? null : <Text type="label">{label}</Text>}
      <View style={[styles.track, !!error && styles.optError]} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => (
          <Segment key={o.value} label={o.label} on={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
      {error ? (
        <Text type="supporting" tone="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * D-123: pick one of the repayment periods the society offers (loan tenure). A period the member's
 * remaining service cannot cover stays visible but switched off, with the reason underneath.
 */
export function MonthPicker({ label, value, choices, onChange, error }: { label: string; value?: number; choices: Array<{ months: number; allowed: boolean; reason?: string }>; onChange: (months: number) => void; error?: string }) {
  const blocked = choices.find((c) => !c.allowed && c.reason);
  return (
    <View style={{ gap: spacing[1.5] }}>
      <Text type="label">{label}</Text>
      <View style={styles.monthRow} accessibilityRole="radiogroup">
        {choices.map((c) => (
          <OptionButton
            key={c.months}
            label={`${c.months} months`}
            accessibilityLabel={`${c.months} months${c.allowed ? '' : `, not available. ${c.reason ?? ''}`}`}
            on={value === c.months}
            disabled={!c.allowed}
            error={!!error}
            onPress={() => onChange(c.months)}
            style={styles.month}
          />
        ))}
      </View>
      {blocked ? (
        <Text type="supporting" tone="secondary">
          {blocked.reason}
        </Text>
      ) : null}
      {error ? (
        <Text type="supporting" tone="error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Astryx NumberInput: − value + with bounds (shares). The figure slides in the direction it moved. */
export function NumberInput({ value, min, max, step = 1, onChange, accessibilityLabel }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; accessibilityLabel: string }) {
  const mode = useMotionMode();
  const y = useRef(new Animated.Value(0)).current;
  const last = useRef(value);
  useEffect(() => {
    if (value === last.current) return;
    if (mode === 'full') {
      y.setValue(value > last.current ? 8 : -8);
      Animated.timing(y, { toValue: 0, duration: motion.duration.fast, useNativeDriver: true }).start();
    }
    last.current = value;
  }, [value, mode, y]);
  const btn = (label: 'Decrease' | 'Increase', next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${accessibilityLabel}`}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onChange(next);
      }}
      style={({ pressed }) => [styles.stepBtn, pressed && styles.stepPressed, disabled && styles.off]}
    >
      {label === 'Decrease' ? <Minus size={20} color={color.accent} strokeWidth={2} /> : <Plus size={20} color={color.accent} strokeWidth={2} />}
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${accessibilityLabel}: ${value}`}>
      {btn('Decrease', Math.max(min, value - step), value <= min)}
      <Animated.View style={{ minWidth: 72, transform: [{ translateY: y }] }}>
        <Text type="h3" style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </Animated.View>
      {btn('Increase', Math.min(max, value + step), value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  off: { opacity: 0.4 },
  opt: { minHeight: touchTarget, paddingHorizontal: spacing[3], borderRadius: radius.element, borderCurve: 'continuous', borderWidth: 1, borderColor: color.borderEmphasized, backgroundColor: color.background.surface, alignItems: 'center', justifyContent: 'center' },
  optError: { borderColor: color.status.error.solid },
  // Covers the resting 1 px border, so the 2 px accent border sits exactly on it.
  optOn: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: radius.element, borderCurve: 'continuous', borderWidth: 2, borderColor: color.accent, backgroundColor: color.accentMuted },
  track: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], padding: spacing[1], borderRadius: radius.element, borderCurve: 'continuous', borderWidth: 1, borderColor: color.border, backgroundColor: color.track },
  seg: { flexGrow: 1, minHeight: touchTarget - 8, paddingHorizontal: spacing[3], borderRadius: radius.inner, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  segOn: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.inner, borderCurve: 'continuous', backgroundColor: color.background.surface, boxShadow: shadow.med },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
  monthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  // An even three-column grid; a short last row keeps the same widths.
  month: { flexBasis: '31%', flexGrow: 1, maxWidth: '33%' },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: color.borderEmphasized, borderRadius: radius.element, borderCurve: 'continuous', backgroundColor: color.background.surface, overflow: 'hidden' },
  stepBtn: { width: touchTarget + 8, height: touchTarget + 8, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: color.overlayPressed },
  card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface },
  cardOn: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 2, borderColor: color.accent, backgroundColor: color.accentMuted },
  icon: { width: 44, height: 44, borderRadius: radius.element, borderCurve: 'continuous', backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.borderEmphasized, alignItems: 'center', justifyContent: 'center', backgroundColor: color.background.surface },
  radioOn: { borderColor: color.accent },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  yn: { gap: spacing[2], padding: spacing[4], borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface },
  cb: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start', minHeight: touchTarget, paddingVertical: spacing[2] },
  box: { width: 24, height: 24, borderRadius: radius.inner - 2, borderWidth: 2, borderColor: color.borderEmphasized, marginTop: 1, overflow: 'hidden' },
  boxOn: { position: 'absolute', top: -2, right: -2, bottom: -2, left: -2, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
});
