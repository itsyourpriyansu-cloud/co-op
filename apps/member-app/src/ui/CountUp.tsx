// A money figure that counts up once, the first time it shows (home hero). Later values (pull to refresh)
// and Reduce Motion / web show at once. Screen readers read the parent's label, never the moving figure.
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated } from 'react-native';
import { motion } from '@/theme';
import { ease, useMotionMode } from './motion';
import { Text } from './Text';

export function CountUp({ value, format, ...text }: { value: number; format: (n: number) => string } & Omit<ComponentProps<typeof Text>, 'children'>) {
  const mode = useMotionMode();
  const [shown, setShown] = useState(mode === 'full' ? 0 : value);
  const counted = useRef(false);
  useEffect(() => {
    if (mode !== 'full' || counted.current) return setShown(value);
    counted.current = true;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    Animated.timing(v, { toValue: value, duration: motion.duration.medium, easing: ease.standard, useNativeDriver: false }).start(() => setShown(value));
    return () => v.removeListener(id);
  }, [value, mode]);
  return <Text {...text}>{format(shown)}</Text>;
}
