// WizardProgress (multi-step forms) and StageTracker (parcel-tracker style, docs/12 §2.2, MJ-05).
import { StyleSheet, View } from 'react-native';
import { Check, CircleAlert, X } from 'lucide-react-native';
import { color, radius, space } from '@/theme';
import { Text } from './Text';

export function WizardProgress({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={{ gap: space[4] }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }} accessibilityLabel={`Step ${step} of ${total}: ${title}`}>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.bar, i < step && styles.barOn]} />
        ))}
      </View>
      <Text role="caption" tone="tertiary">
        Step {step} of {total}
      </Text>
    </View>
  );
}

export type StageStatus = 'done' | 'current' | 'todo' | 'attention' | 'failed';
export interface Stage {
  key: string;
  title: string;
  description?: string;
  date?: string;
  status: StageStatus;
}

export function StageTracker({ stages }: { stages: Stage[] }) {
  return (
    <View>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const dot =
          s.status === 'done' ? { bg: color.status.success.solid, Icon: Check }
          : s.status === 'attention' ? { bg: color.status.warning.solid, Icon: CircleAlert }
          : s.status === 'failed' ? { bg: color.status.danger.solid, Icon: X }
          : s.status === 'current' ? { bg: color.brand.solid, Icon: null }
          : { bg: color.bg.surface, Icon: null };
        return (
          <View key={s.key} style={styles.stage} accessible accessibilityLabel={`${s.title}, ${s.status}${s.date ? `, ${s.date}` : ''}`}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dot.bg }, s.status === 'todo' && styles.dotTodo, s.status === 'current' && styles.dotCurrent]}>
                {dot.Icon ? <dot.Icon size={14} color={color.text.onBrand} strokeWidth={3} /> : s.status === 'current' ? <View style={styles.pulse} /> : null}
              </View>
              {!last ? <View style={[styles.line, s.status === 'done' && { backgroundColor: color.status.success.solid }]} /> : null}
            </View>
            <View style={[styles.body, !last && { paddingBottom: space[10] }]}>
              <View style={styles.titleRow}>
                <Text role={s.status === 'current' || s.status === 'attention' ? 'cardTitle' : 'bodyStrong'} tone={s.status === 'todo' ? 'tertiary' : 'primary'} style={{ flex: 1 }}>
                  {s.title}
                </Text>
                {s.date ? (
                  <Text role="caption" tone="tertiary">
                    {s.date}
                  </Text>
                ) : null}
              </View>
              {s.description ? (
                <Text role="caption" tone={s.status === 'attention' ? 'warning' : 'secondary'}>
                  {s.description}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', gap: space[2] },
  bar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: color.border.default },
  barOn: { backgroundColor: color.brand.solid },
  stage: { flexDirection: 'row', gap: space[6] },
  rail: { alignItems: 'center', width: 28 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotTodo: { borderWidth: 2, borderColor: color.border.strong },
  dotCurrent: { borderWidth: 4, borderColor: color.brand.subtleHover },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.text.onBrand },
  line: { flex: 1, width: 2, backgroundColor: color.border.default, marginVertical: 2 },
  body: { flex: 1, gap: space[1], paddingTop: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
});
