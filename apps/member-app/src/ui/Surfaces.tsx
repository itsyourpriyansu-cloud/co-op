// Astryx Card (clickable / selectable when given onPress / selected), HeroCard, Banner, Section,
// MetadataListItem, ListRow, Divider (docs/25 §5). Cards separate by surface step + hairline border, never
// by shadow; the hero is the one raised surface.
import { useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { color, radius, shadow, spacing, touchTarget, type StatusName } from '@/theme';
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

/**
 * D-139 glass hero: the screen's top summary on a navy gradient lit by a gold glow, ringed in gold.
 * Put frosted tiles (`glassTile`) on it. Accessibility props pass through so a hero can read as one.
 */
export function HeroCard({ children, style, ...a11y }: { children: ReactNode; style?: StyleProp<ViewStyle>; accessible?: boolean; accessibilityLabel?: string }) {
  return (
    <View style={[styles.hero, style]} {...a11y}>
      <View pointerEvents="none" style={styles.heroGlow} />
      {children}
    </View>
  );
}
/** The hero's surface, for a navy summary block that is not a HeroCard (a pressable Card, a result panel). */
export const heroSurface: ViewStyle = { backgroundColor: color.hero.solid, backgroundImage: color.hero.gradient, borderRadius: radius.page, borderCurve: 'continuous', borderWidth: 1, borderColor: color.hero.ring, overflow: 'hidden', boxShadow: shadow.high };
/** A frosted tile on the HeroCard. */
export const glassTile: ViewStyle = { backgroundColor: color.hero.glass, borderWidth: 1, borderColor: color.hero.glassBorder, borderRadius: radius.element, borderCurve: 'continuous', boxShadow: color.hero.glassEdge };

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

/** A value too long for the right-hand column (a bank account, a sign-off line) goes under its label instead
 *  of wrapping into a narrow right-aligned column. Short figures stay label left, value right. */
export const stacksValue = (label: string, value: string) => value.length > 24 || label.length + value.length > 48;

/** Astryx MetadataListItem: label left, value right, figures tabular; long values stack under the label. */
export function MetadataListItem({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  if (stacksValue(label, value))
    return (
      <View style={styles.kvStacked}>
        <Text type="supporting" tone="secondary">
          {label}
        </Text>
        <Text type={emphasis ? 'amount' : 'body'} weight={emphasis ? undefined : 'medium'}>
          {value}
        </Text>
      </View>
    );
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

/** Menu row in a `Card padded={false}`: icon tile, label, optional hint, chevron. */
export function ListRow({ icon: Icon, label, hint, onPress, danger, divider, right }: { icon?: LucideIcon; label: string; hint?: string; onPress: () => void; danger?: boolean; divider?: boolean; right?: ReactNode }) {
  const tint = danger ? color.status.error.text : color.text.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { backgroundColor: color.overlayPressed }]}>
      {Icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: color.status.error.tint }]}>
          <Icon size={20} color={danger ? tint : color.accent} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: spacing[0.5], paddingVertical: spacing[1.5] }}>
        <Text type="body" weight="medium" style={{ color: tint }}>
          {label}
        </Text>
        {hint ? (
          <Text type="supporting" tone="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
      {!danger ? <ChevronRight size={20} color={color.icon.secondary} /> : null}
    </Pressable>
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
  hero: { ...heroSurface, padding: spacing[5], gap: spacing[2] },
  // Gold light from the top-right corner, half off the card.
  heroGlow: { position: 'absolute', top: -120, right: -100, width: 280, height: 280, backgroundImage: color.hero.glow },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: touchTarget + 8, paddingHorizontal: spacing[4] },
  rowDivider: { borderTopWidth: 1, borderTopColor: color.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.inner, borderCurve: 'continuous', backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1 },
  bannerIcon: { marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] },
  kv: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[4], paddingVertical: spacing[2] },
  kvStacked: { gap: spacing[0.5], paddingVertical: spacing[2] },
  kvValue: { flexShrink: 1, maxWidth: '64%', textAlign: 'right', fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.borderEmphasized },
});
