// Card, Alert, Section, KeyValue, Divider (native mirrors of Blend CardV2 / AlertV2 / KeyValuePairV2).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import type { Tone } from '@tgs/design-tokens';
import { color, elevation, radius, space } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export function Card({ children, onPress, selected, padded = true, style, accessibilityLabel }: { children: ReactNode; onPress?: () => void; selected?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const base = [styles.card, padded && styles.padded, selected && styles.selected, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: !!selected }} onPress={onPress} style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export type AlertType = 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'purple';
const ALERT: Record<AlertType, { tone: Tone; icon: LucideIcon }> = {
  primary: { tone: 'info', icon: Info },
  success: { tone: 'success', icon: CircleCheck },
  warning: { tone: 'warning', icon: TriangleAlert },
  error: { tone: 'danger', icon: CircleAlert },
  neutral: { tone: 'neutral', icon: Info },
  purple: { tone: 'approval', icon: Info },
};

export function Alert({ type = 'primary', heading, description, action }: { type?: AlertType; heading: string; description?: string; action?: { text: string; onPress: () => void } }) {
  const a = ALERT[type];
  const s = color.status[a.tone];
  return (
    <View accessibilityRole="alert" style={[styles.alert, { backgroundColor: s.bg, borderColor: s.border }]}>
      <a.icon size={20} color={s.fg} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="label" style={{ color: s.fg }}>
          {heading}
        </Text>
        {description ? (
          <Text role="caption" tone="secondary">
            {description}
          </Text>
        ) : null}
        {action ? <Button text={action.text} subType="inline" onPress={action.onPress} /> : null}
      </View>
    </View>
  );
}

export function Section({ title, description, right, children }: { title?: string; description?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space[6] }}>
      {title ? (
        <View style={styles.sectionHead}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="sectionTitle">{title}</Text>
            {description ? (
              <Text role="caption" tone="tertiary">
                {description}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function KeyValue({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text role={emphasis ? 'amount' : 'bodyStrong'} style={{ flex: 1.4, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.bg.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, ...elevation.raised },
  padded: { padding: space[8] },
  selected: { borderColor: color.brand.solid, backgroundColor: color.brand.subtle },
  pressed: { backgroundColor: color.bg.surfaceSubtle },
  alert: { flexDirection: 'row', gap: space[6], padding: space[8], borderRadius: radius.card, borderWidth: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space[6] },
  kv: { flexDirection: 'row', alignItems: 'flex-start', gap: space[8], paddingVertical: space[4] },
  divider: { height: 1, backgroundColor: color.border.subtle },
});
