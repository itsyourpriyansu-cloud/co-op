// Astryx Card (clickable / selectable when given onPress / selected), Banner, Section, MetadataListItem,
// Divider (docs/25 §5). Cards separate by surface step + hairline border, never by shadow.
import { useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { color, radius, spacing, type StatusName } from '@/theme';
import { Link } from './Button';
import { useEnter, usePressScale } from './motion';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({ children, onPress, selected, padded = true, style, accessibilityLabel }: { children: ReactNode; onPress?: () => void; selected?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const [pressed, setPressed] = useState(false);
  const { scaleStyle, pressHandlers } = usePressScale(0.98);
  const base = [styles.card, padded && styles.padded, selected && styles.selected, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        pressHandlers.onPressIn();
      }}
      onPressOut={() => {
        setPressed(false);
        pressHandlers.onPressOut();
      }}
      style={[...base, scaleStyle]}
    >
      {children}
      {/* Pressed tint sits over any card colour, the navy hero included. */}
      {pressed ? <View pointerEvents="none" style={styles.pressTint} /> : null}
    </AnimatedPressable>
  );
}

export type BannerStatus = 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'approval';
const BANNER_ICON: Record<BannerStatus, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert, neutral: Info, approval: Info };

export function Banner({ status = 'info', heading, description, action }: { status?: BannerStatus; heading: string; description?: string; action?: { text: string; onPress: () => void } }) {
  const s = color.status[status satisfies StatusName];
  const Icon = BANNER_ICON[status];
  const enter = useEnter();
  return (
    <Animated.View accessibilityRole="alert" style={[styles.banner, { backgroundColor: s.tint, borderColor: s.border }, enter]}>
      <Icon size={20} color={s.text} strokeWidth={1.75} style={styles.bannerIcon} />
      <View style={{ flex: 1, gap: spacing[1] }}>
        <Text type="label" weight="semibold" style={{ color: s.text }}>
          {heading}
        </Text>
        {description ? (
          <Text type="supporting" tone="secondary">
            {description}
          </Text>
        ) : null}
        {action ? <Link label={action.text} onPress={action.onPress} /> : null}
      </View>
    </Animated.View>
  );
}

export function Section({ title, description, right, children }: { title?: string; description?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: spacing[3] }}>
      {title ? (
        <View style={styles.sectionHead}>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <Text type="h3">
              {title}
            </Text>
            {description ? (
              <Text type="supporting" tone="secondary">
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

/** Astryx MetadataListItem: label left, value right, figures tabular. */
export function MetadataListItem({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text type="supporting" tone="secondary" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Text type={emphasis ? 'amount' : 'body'} weight={emphasis ? undefined : 'medium'} style={styles.kvValue}>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.background.surface, borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1, borderColor: color.border, overflow: 'hidden' },
  padded: { padding: spacing[4] },
  selected: { borderColor: color.accent, backgroundColor: color.accentMuted },
  pressTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: color.overlayPressed },
  banner: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1 },
  bannerIcon: { marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] },
  kv: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[4], paddingVertical: spacing[2] },
  kvValue: { flexShrink: 1, maxWidth: '64%', textAlign: 'right', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.borderEmphasized },
});
