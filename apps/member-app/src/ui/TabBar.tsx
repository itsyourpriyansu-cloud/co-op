// Astryx MobileNav styling for the Expo Router bottom tabs (member + staff). The active tab gets the
// gold indicator (the screen's one gold moment) and a spring bump; a tab press ticks a haptic.
// Tabs are peers: no slide between them (docs/25 §5).
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { color, FONT, motion, radius, shadow } from '@/theme';
import { haptic, useMotionMode, useToggle } from './motion';

function TabIcon({ Icon, focused, size }: { Icon: LucideIcon; focused: boolean; size: number }) {
  const mode = useMotionMode();
  const v = useToggle(focused);
  const bump = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!focused || mode !== 'full') return;
    bump.setValue(0.82);
    Animated.spring(bump, { toValue: 1, ...motion.spring, useNativeDriver: true }).start();
  }, [focused, mode, bump]);
  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.indicator, { opacity: v, transform: [{ scaleX: v }] }]} />
      <Animated.View style={{ transform: [{ scale: bump }] }}>
        <Icon color={focused ? color.accent : color.icon.secondary} size={size} strokeWidth={focused ? 2.25 : 1.75} />
      </Animated.View>
    </View>
  );
}

/** `tabBarIcon` for a Lucide icon. */
export const tabIcon =
  (Icon: LucideIcon) =>
  ({ focused, size }: { focused: boolean; size: number }) => <TabIcon Icon={Icon} focused={focused} size={size} />;

export const tabBarOptions = {
  headerShown: false,
  tabBarActiveTintColor: color.accent,
  tabBarInactiveTintColor: color.text.secondary,
  tabBarStyle: { backgroundColor: color.background.surface, borderTopColor: color.borderEmphasized, borderTopWidth: StyleSheet.hairlineWidth, minHeight: 64, boxShadow: shadow.low },
  tabBarLabelStyle: { fontSize: 12, fontFamily: FONT.semibold },
} as const;

export const tabBarListeners = { tabPress: () => haptic.select() };

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  // Sits on the bar's top edge, above the icon.
  indicator: { position: 'absolute', top: -9, width: 24, height: 3, borderRadius: radius.full, backgroundColor: color.gold },
});
