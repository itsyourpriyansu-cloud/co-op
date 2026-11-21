// The society's poster, shown full screen for a moment on every app start, right after the native
// splash (Android 12+ only allows a small icon there). Tap to skip. Not on web: the browser build is
// for testing and the poster would sit over every test.
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet } from 'react-native';
import { motion } from '@/theme';
import { ease } from '@/ui';

const SHOW_MS = 2500;
/** The poster's own top and bottom colour, so taller screens get seamless bands instead of cropping. */
const POSTER_BLUE = '#7dd3f7';

export function LaunchPoster() {
  const [visible, setVisible] = useState(Platform.OS !== 'web');
  const opacity = useRef(new Animated.Value(1)).current;

  const close = () => Animated.timing(opacity, { toValue: 0, duration: motion.duration.mediumMin, easing: ease.exit, useNativeDriver: true }).start(() => setVisible(false));

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(close, SHOW_MS);
    return () => clearTimeout(t);
    // Once per start; close only uses a stable Animated value.
  }, []);

  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { opacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="The Telangana Secretariat Employees Co-operative Credit Society Ltd. Tap to continue">
        <Image source={require('../../assets/launch-poster.jpg')} style={styles.image} resizeMode="contain" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: POSTER_BLUE, zIndex: 1000, elevation: 1000 },
  image: { width: '100%', height: '100%' },
});
