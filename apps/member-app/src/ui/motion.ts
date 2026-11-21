// Motion + haptics for the kit (D-138, docs/25 §4.6). Astryx rules: animation never blocks the next tap,
// a finger means a spring, exits accelerate, Reduce Motion turns movement into a short cross-fade.
// Expo web (preview + e2e) gets no motion at all: Astryx changes state at once under a mouse, and axe
// must never measure contrast mid-fade.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { motion } from '@/theme';

const isWeb = Platform.OS === 'web';
export const ease = {
  standard: Easing.bezier(...motion.curve.standard),
  exit: Easing.bezier(...motion.curve.exit),
};

// One OS subscription for the whole app, shared by every hook.
let reduced = false;
const listeners = new Set<() => void>();
if (!isWeb) {
  void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
    reduced = v;
    listeners.forEach((l) => l());
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    reduced = v;
    listeners.forEach((l) => l());
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 'full' = move + fade · 'fade' = Reduce Motion (opacity only, ≤ 200 ms) · 'none' = web. */
export type MotionMode = 'full' | 'fade' | 'none';
export function useMotionMode(): MotionMode {
  const r = useSyncExternalStore(subscribe, () => reduced, () => reduced);
  return isWeb ? 'none' : r ? 'fade' : 'full';
}

const timing = (v: Animated.Value, toValue: number, duration: number, easing = ease.standard, delay = 0) =>
  Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: true });

/** Spring scale on press (buttons, clickable cards). Spread `pressHandlers` on the Pressable, `scaleStyle` in its style. */
export function usePressScale(to = 0.97) {
  const mode = useMotionMode();
  const scale = useRef(new Animated.Value(1)).current;
  const go = (toValue: number) => {
    if (mode !== 'full') return;
    Animated.spring(scale, { toValue, ...motion.spring, useNativeDriver: true }).start();
  };
  return {
    scaleStyle: { transform: [{ scale }] },
    pressHandlers: { onPressIn: () => go(to), onPressOut: () => go(1) },
  };
}

/** Fade + 8 px rise on mount, staggered by index (screen blocks, banners). */
export function useEnter(index = 0) {
  const mode = useMotionMode();
  const v = useRef(new Animated.Value(mode === 'none' ? 1 : 0)).current;
  useEffect(() => {
    if (mode === 'none') return;
    const delay = Math.min(index, motion.stagger.max) * motion.stagger.step;
    timing(v, 1, mode === 'fade' ? motion.duration.reduced : motion.duration.mediumMin, ease.standard, delay).start();
    // Mount-only: a later Reduce Motion change must not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (mode === 'none') return undefined;
  return {
    opacity: v,
    ...(mode === 'full' ? { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [motion.stagger.rise, 0] }) }] } : {}),
  };
}

/** Animated 0 → 1 that follows a boolean (selection, focus, open). Native driver: opacity / transform only. */
export function useToggle(on: boolean, duration: number = motion.duration.fast) {
  const mode = useMotionMode();
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (mode === 'none') return v.setValue(on ? 1 : 0);
    timing(v, on ? 1 : 0, mode === 'fade' ? Math.min(duration, motion.duration.reduced) : duration, on ? ease.standard : ease.exit).start();
  }, [on, mode, duration, v]);
  return v;
}

/** One horizontal shake when `trigger` turns truthy (a field error appears). Full motion only. */
export function useShake(trigger: unknown) {
  const mode = useMotionMode();
  const x = useRef(new Animated.Value(0)).current;
  const was = useRef(!!trigger);
  useEffect(() => {
    const now = !!trigger;
    if (now && !was.current) {
      haptic.error();
      if (mode === 'full') {
        const step = (toValue: number) => Animated.timing(x, { toValue, duration: 50, easing: Easing.linear, useNativeDriver: true });
        Animated.sequence([step(6), step(-6), step(4), step(-4), step(2), step(0)]).start();
      }
    }
    was.current = now;
  }, [trigger, mode, x]);
  return { transform: [{ translateX: x }] };
}

/** Haptics are punctuation: selection ticks, a light tap on primary actions, a buzz on errors. */
const safe = (fn: () => Promise<void>) => () => {
  if (isWeb) return;
  fn().catch(() => undefined);
};
export const haptic = {
  select: safe(() => Haptics.selectionAsync()),
  tap: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  error: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
