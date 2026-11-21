// Astryx Stepper (multi-step forms) and StageTracker (parcel-tracker style, docs/12 §2.2, MJ-05).
// Bars fill as steps complete; the current stage breathes a gold halo (the tracker's one gold moment).
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Check, CircleAlert, X } from 'lucide-react-native';
import { color, motion, radius, spacing } from '@/theme';
import { useMotionMode, useToggle } from './motion';
import { Text } from './Text';

function StepBar({ on }: { on: boolean }) {
  const v = useToggle(on, motion.duration.medium);
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, { transform: [{ scaleX: v }] }]} />
    </View>
  );
}

export function Stepper({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={{ gap: spacing[2] }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }} accessibilityLabel={`Step ${step} of ${total}: ${title}`}>
      <View style={styles.bars}>
        {Array.from({ length: total }, (_, i) => (
          <StepBar key={i} on={i < step} />
        ))}
      </View>
      <Text type="supporting" tone="secondary">
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

/** Gold halo that breathes out from the current stage (slow band). Static under Reduce Motion and on web. */
function Halo() {
  const mode = useMotionMode();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (mode !== 'full') return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: motion.duration.slowLoop, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [mode, v]);
  if (mode !== 'full') return <View pointerEvents="none" style={[styles.halo, styles.haloStatic]} />;
  return <Animated.View pointerEvents="none" style={[styles.halo, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />;
}

export function StageTracker({ stages }: { stages: Stage[] }) {
  return (
    <View>
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const dot =
          s.status === 'done' ? { bg: color.status.success.solid, Icon: Check }
          : s.status === 'attention' ? { bg: color.status.warning.solid, Icon: CircleAlert }
          : s.status === 'failed' ? { bg: color.status.error.solid, Icon: X }
          : s.status === 'current' ? { bg: color.accent, Icon: null }
          : { bg: color.background.surface, Icon: null };
        const iconColor = s.status === 'attention' ? color.status.warning.onSolid : color.text.onAccent;
        return (
          <View key={s.key} style={styles.stage} accessible accessibilityLabel={`${s.title}, ${s.status}${s.date ? `, ${s.date}` : ''}`}>
            <View style={styles.rail}>
              <View style={styles.dotWrap}>
                {s.status === 'current' ? <Halo /> : null}
                <View style={[styles.dot, { backgroundColor: dot.bg }, s.status === 'todo' && styles.dotTodo, s.status === 'current' && styles.dotCurrent]}>
                  {dot.Icon ? <dot.Icon size={14} color={iconColor} strokeWidth={3} /> : s.status === 'current' ? <View style={styles.core} /> : null}
                </View>
              </View>
              {!last ? <View style={[styles.line, s.status === 'done' && { backgroundColor: color.status.success.solid }]} /> : null}
            </View>
            <View style={[styles.body, !last && { paddingBottom: spacing[5] }]}>
              <View style={styles.titleRow}>
                <Text type={s.status === 'current' || s.status === 'attention' ? 'h4' : 'body'} weight={s.status === 'current' || s.status === 'attention' ? undefined : 'medium'} tone={s.status === 'todo' ? 'secondary' : 'primary'} style={{ flex: 1 }}>
                  {s.title}
                </Text>
                {s.date ? (
                  <Text type="supporting" tone="secondary">
                    {s.date}
                  </Text>
                ) : null}
              </View>
              {s.description ? (
                <Text type="supporting" tone={s.status === 'attention' ? 'warning' : 'secondary'}>
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
  bars: { flexDirection: 'row', gap: spacing[1] },
  bar: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: color.track, overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: color.accent, transformOrigin: 'left' },
  stage: { flexDirection: 'row', gap: spacing[3] },
  rail: { alignItems: 'center', width: 28 },
  dotWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotTodo: { borderWidth: 2, borderColor: color.borderEmphasized },
  dotCurrent: { borderWidth: 3, borderColor: color.gold },
  halo: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: color.gold },
  haloStatic: { width: 36, height: 36, borderRadius: 18, opacity: 0.25 },
  core: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.text.onAccent },
  line: { flex: 1, width: 2, backgroundColor: color.track, marginVertical: 2 },
  body: { flex: 1, gap: spacing[0.5], paddingTop: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
});
