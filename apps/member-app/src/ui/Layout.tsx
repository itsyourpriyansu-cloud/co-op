// Screen scaffolding: safe areas, keyboard avoidance, sticky bottom CTA, header with back (docs/12 §2.2).
import { useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import { color, radius, space, theme, touchTarget } from '@/theme';
import { Button } from './Button';

const layoutWidth = theme.layout.contentMaxWidth;
import { Text } from './Text';

/**
 * Keeps the focused field visible above the keyboard (all screens use Screen). The KeyboardAvoidingView
 * lifts the footer; this scrolls the field itself up, with a margin, above the footer and the keyboard.
 * Android draws edge to edge (SDK 58), so the window never resizes by itself.
 */
function useKeepFocusedFieldVisible(scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>, footerHeight: RefObject<number>) {
  const scrollY = useRef(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      // Wait for the avoiding view to resize before measuring.
      setTimeout(() => {
        const field = TextInput.State.currentlyFocusedInput?.();
        if (!field) return;
        field.measureInWindow((_x, y, _w, h) => {
          const visibleBottom = e.endCoordinates.screenY - footerHeight.current - 16;
          const overlap = y + h - visibleBottom;
          if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
        });
      }, 120);
    });
    return () => sub.remove();
  }, [scrollRef, footerHeight]);
  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };
}

export function Screen({ children, footer, header, scroll = true, background = color.bg.canvas, contentStyle, refreshing, onRefresh }: { children: ReactNode; footer?: ReactNode; header?: ReactNode; scroll?: boolean; background?: string; contentStyle?: StyleProp<ViewStyle>; refreshing?: boolean; onRefresh?: () => void }) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const footerHeight = useRef(0);
  const onScroll = useKeepFocusedFieldVisible(scrollRef, footerHeight);
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={32}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // Web keyboard users can then scroll a long list that has nothing else to focus (axe).
      {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : {})}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.brand.solid} colors={[color.brand.solid]} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <View style={[styles.fill, styles.column]}>
          {header}
          {body}
          {footer ? (
            <View style={styles.footer} onLayout={(e) => (footerHeight.current = e.nativeEvent.layout.height)}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Header({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <ArrowLeft size={22} color={color.text.primary} />
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      <Text role="cardTitle" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={[styles.back, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** Large heading block at the top of a step or screen. */
export function Hero({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <View style={{ gap: space[4] }}>
      {Icon ? (
        <View style={styles.heroIcon}>
          <Icon size={26} color={color.brand.solid} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text role="pageTitle">{title}</Text>
      {subtitle ? (
        <Text role="body" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Spot illustration (placeholder until the illustration set exists, docs/12 §6) + text + action. */
export function EmptyState({ icon: Icon, title, description, action, tone = 'brand' }: { icon: LucideIcon; title: string; description?: string; action?: { text: string; onPress: () => void }; tone?: 'brand' | 'warning' | 'danger' | 'success' }) {
  const t = { brand: [color.brand.subtle, color.brand.solid], warning: [color.status.warning.bg, color.status.warning.fg], danger: [color.status.danger.bg, color.status.danger.fg], success: [color.status.success.bg, color.status.success.fg] }[tone];
  return (
    <View style={styles.empty}>
      <View style={[styles.illus, { backgroundColor: t[0] }]}>
        <Icon size={36} color={t[1]} strokeWidth={1.5} />
      </View>
      <Text role="sectionTitle" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text role="body" tone="secondary" style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
      {action ? <Button text={action.text} onPress={action.onPress} style={{ marginTop: space[4] }} /> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius: r = radius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  // testID lets the e2e suite wait until a screen has finished loading.
  return <Animated.View testID="skeleton" style={{ height, width, borderRadius: r, backgroundColor: color.bg.surfaceSunken, opacity: v }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', maxWidth: layoutWidth, alignSelf: 'center' },
  content: { padding: space[8], gap: space[12], paddingBottom: space[16] },
  footer: { padding: space[8], paddingTop: space[6], gap: space[4], backgroundColor: color.bg.surface, borderTopWidth: 1, borderTopColor: color.border.subtle },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4] },
  back: { width: touchTarget, height: touchTarget, justifyContent: 'center', alignItems: 'center' },
  heroIcon: { width: 52, height: 52, borderRadius: radius.card, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  empty: { alignItems: 'center', gap: space[6], paddingVertical: space[16], paddingHorizontal: space[8] },
  illus: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
});
