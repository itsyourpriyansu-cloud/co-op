// Astryx Layout for a phone: Screen (safe areas, keyboard, sticky footer, staggered entrance), Header,
// PageHeader, EmptyState, Skeleton (docs/25 §5).
import { Children, useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import { color, layout, radius, shadow, spacing, touchTarget } from '@/theme';
import { Button } from './Button';
import { useEnter } from './motion';
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

/**
 * Wraps one block of a screen so it fades and rises in, after the blocks before it. The block may be a
 * fragment of many sections, so the wrapper repeats the screen's gap (without it they touch on a phone).
 */
function Enter({ index, children }: { index: number; children: ReactNode }) {
  const style = useEnter(index);
  return style ? <Animated.View style={[styles.block, style]}>{children}</Animated.View> : <>{children}</>;
}

export function Screen({ children, footer, header, refreshing, onRefresh }: { children: ReactNode; footer?: ReactNode; header?: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const footerHeight = useRef(0);
  const onScroll = useKeepFocusedFieldVisible(scrollRef, footerHeight);
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: color.background.body }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <View style={[styles.fill, styles.column]}>
          {header}
          <ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // Web keyboard users can then scroll a long list that has nothing else to focus (axe).
            {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : {})}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.accent} colors={[color.accent]} /> : undefined}
          >
            {Children.toArray(children).map((child, i) => (
              <Enter key={i} index={i}>
                {child}
              </Enter>
            ))}
          </ScrollView>
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

/** Astryx LayoutHeader: back on the left, centred title, an optional action on the right. */
export function Header({ title, onBack, right }: { title?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={({ pressed }) => [styles.back, pressed && styles.backPressed]}>
          <ArrowLeft size={22} color={color.icon.primary} strokeWidth={1.75} />
        </Pressable>
      ) : (
        <View style={styles.back} />
      )}
      <Text type="h4" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={[styles.back, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** Large heading block at the top of a step or screen. */
export function PageHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <View style={{ gap: spacing[2] }}>
      {Icon ? (
        <View style={styles.pageIcon}>
          <Icon size={24} color={color.accent} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text type="h1">{title}</Text>
      {subtitle ? (
        <Text type="body" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export type EmptyTone = 'accent' | 'warning' | 'error' | 'success';

/** Astryx EmptyState: icon disc + text + one action. */
export function EmptyState({ icon: Icon, title, description, action, tone = 'accent' }: { icon: LucideIcon; title: string; description?: string; action?: { text: string; onPress: () => void }; tone?: EmptyTone }) {
  const [bg, fg] = tone === 'accent' ? [color.accentMuted, color.accent] : [color.status[tone].tint, color.status[tone].text];
  return (
    <View style={styles.empty}>
      <View style={[styles.illus, { backgroundColor: bg }]}>
        <Icon size={32} color={fg} strokeWidth={1.5} />
      </View>
      <Text type="h3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text type="body" tone="secondary" style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
      {action ? <Button label={action.text} onPress={action.onPress} style={{ marginTop: spacing[2] }} /> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius: r = radius.inner }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(v, { toValue: 0.55, duration: 650, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  // testID lets the e2e suite wait until a screen has finished loading.
  return <Animated.View testID="skeleton" style={{ height, width, borderRadius: r, backgroundColor: color.skeleton, opacity: v }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  content: { padding: layout.gutter, gap: spacing[6], paddingBottom: spacing[8] },
  block: { gap: spacing[6] },
  footer: { padding: spacing[4], paddingTop: spacing[3], gap: spacing[2], backgroundColor: color.background.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderEmphasized, boxShadow: shadow.low },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[2] },
  back: { width: touchTarget, height: touchTarget, justifyContent: 'center', alignItems: 'center', borderRadius: radius.full },
  backPressed: { backgroundColor: color.overlayPressed },
  pageIcon: { width: 48, height: 48, borderRadius: radius.element, borderCurve: 'continuous', backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1] },
  empty: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8], paddingHorizontal: spacing[4] },
  illus: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1] },
});
