import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { color, motion } from '@/theme';
import { ease, useMotionMode } from '@/ui';

// App mark: the society logo (D-137). Rendered from assets/logo/tgseccs-logo.png.
const MARK = require('../../assets/images/app-mark.png');

/**
 * `intro` (entry screens): the seal settles in from 92 % and a gold ring breathes out once behind it
 * (D-138, the screen's gold moment). Reduce Motion: a fade only. Web: static.
 */
export function AppMark({ size = 48, intro }: { size?: number; intro?: boolean }) {
  const mode = useMotionMode();
  const play = intro && mode !== 'none';
  const v = useRef(new Animated.Value(play ? 0 : 1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!play) return;
    Animated.timing(v, { toValue: 1, duration: mode === 'fade' ? motion.duration.reduced : motion.duration.medium, easing: ease.standard, useNativeDriver: true }).start();
    if (mode === 'full') Animated.timing(ring, { toValue: 1, duration: motion.duration.slowLoop, delay: motion.duration.mediumMin, easing: ease.standard, useNativeDriver: true }).start();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const image = <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="TGSECCSL" />;
  if (!play) return image;
  return (
    <View style={styles.center}>
      {mode === 'full' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { width: size, height: size, borderRadius: size / 2, opacity: ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.8, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.45] }) }] }]}
        />
      ) : null}
      <Animated.View style={{ opacity: v, transform: mode === 'full' ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] : [] }}>{image}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: color.gold },
});
