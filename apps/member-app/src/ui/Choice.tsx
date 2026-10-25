// Choice controls: ChoiceCard (radio card), YesNo (eligibility questions), Checkbox (declarations).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
import { color, radius, space, touchTarget } from '@/theme';
import { Text } from './Text';

export function ChoiceCard({ title, description, icon: Icon, selected, onPress, right }: { title: string; description?: string; icon?: LucideIcon; selected?: boolean; onPress: () => void; right?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      aria-checked={!!selected}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && !selected && { backgroundColor: color.bg.surfaceSubtle }]}
    >
      {Icon ? (
        <View style={[styles.icon, selected && { backgroundColor: color.bg.surface }]}>
          <Icon size={22} color={color.brand.solid} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="cardTitle">{title}</Text>
        {description ? (
          <Text role="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {right ?? <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.dot} /> : null}</View>}
    </Pressable>
  );
}

/** One eligibility question with explicit Yes / No buttons (no ambiguous toggles). */
export function YesNo({ question, why, value, onChange }: { question: string; why?: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.yn}>
      <Text role="cardTitle">{question}</Text>
      {why ? (
        <Text role="caption" tone="tertiary">
          {why}
        </Text>
      ) : null}
      <View style={styles.ynRow} accessibilityRole="radiogroup">
        {[true, false].map((v) => {
          const on = value === v;
          return (
            <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} onPress={() => onChange(v)} style={[styles.ynBtn, on && styles.ynOn]}>
              <Text role="label" style={{ color: on ? color.brand.text : color.text.primary }}>
                {v ? 'Yes' : 'No'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked} onPress={() => onChange(!checked)} style={styles.cb}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={16} color={color.text.onBrand} strokeWidth={3} /> : null}</View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="bodyStrong">{label}</Text>
        {description ? (
          <Text role="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Short, mutually exclusive options shown side by side (e.g. gender). */
export function Segmented<T extends string>({ label, value, options, onChange, error }: { label: string; value?: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; error?: string }) {
  return (
    <View style={{ gap: space[3] }}>
      <Text role="label">{label}</Text>
      <View style={styles.ynRow} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} onPress={() => onChange(o.value)} style={[styles.ynBtn, on && styles.ynOn, !!error && !on && { borderColor: color.status.danger.solid }]}>
              <Text role="label" style={{ color: on ? color.brand.text : color.text.primary }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text role="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** − value + counter with bounds (shares). */
export function NumberStepper({ value, min, max, step = 1, onChange, accessibilityLabel }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; accessibilityLabel: string }) {
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${accessibilityLabel}`} disabled={disabled} onPress={() => onChange(next)} style={[styles.stepBtn, disabled && { opacity: 0.4 }]}>
      <Text role="sectionTitle" tone="link">
        {label === 'Decrease' ? '−' : '+'}
      </Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${accessibilityLabel}: ${value}`}>
      {btn('Decrease', Math.max(min, value - step), value <= min)}
      <Text role="metricSm" style={{ minWidth: 72, textAlign: 'center' }}>
        {value}
      </Text>
      {btn('Increase', Math.min(max, value + step), value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: color.border.strong, borderRadius: radius.control, backgroundColor: color.bg.surface },
  stepBtn: { width: touchTarget + 8, height: touchTarget + 8, alignItems: 'center', justifyContent: 'center' },
  card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[6], padding: space[8], borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  cardSelected: { borderColor: color.brand.solid, borderWidth: 2, backgroundColor: color.brand.subtle },
  icon: { width: 44, height: 44, borderRadius: radius.control, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.brand.solid },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand.solid },
  yn: { gap: space[4], padding: space[8], borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  ynRow: { flexDirection: 'row', gap: space[4], marginTop: space[2] },
  ynBtn: { flex: 1, height: touchTarget, borderRadius: radius.control, borderWidth: 1, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center' },
  ynOn: { borderColor: color.brand.solid, borderWidth: 2, backgroundColor: color.brand.subtle },
  cb: { flexDirection: 'row', gap: space[6], alignItems: 'flex-start', minHeight: touchTarget, paddingVertical: space[4] },
  box: { width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: color.brand.solid, borderColor: color.brand.solid },
});
