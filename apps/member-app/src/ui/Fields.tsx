// Astryx Field frame (label above, FieldStatus below: error replaces hint) around TextField, DateField,
// SelectField (opens an Astryx BottomSheet) and OtpInput (docs/25 §5). Names stay *Field: Astryx's
// "TextInput" would clash with React Native's own. Focus draws the 2 px navy ring; a new error shakes once.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Check, ChevronDown, Eye, EyeOff, Search, X } from 'lucide-react-native';
import { parseISODate, toISODate } from '@tgs/domain';
import { color, motion, radius, shadow, spacing, textStyle, touchTarget } from '@/theme';
import { ease, haptic, useMotionMode, useShake } from './motion';
import { Text } from './Text';

interface FieldFrameProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** No label above: the placeholder or the chosen value says what it is. Screen readers still get the label. */
  compact?: boolean | undefined;
  children: ReactNode;
}

function FieldFrame({ label, required, hint, error, compact, children }: FieldFrameProps) {
  const shake = useShake(error);
  return (
    <View style={{ gap: spacing[1.5] }}>
      {compact ? null : (
        <Text type="label">
          {label}
          {required ? (
            <Text type="label" tone="error">
              {' '}*
            </Text>
          ) : null}
        </Text>
      )}
      <Animated.View style={shake}>{children}</Animated.View>
      {error ? (
        <Text type="supporting" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text type="supporting" tone="secondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  prefix?: string;
  /** Trailing control inside the box (e.g. Show / Hide on a password). */
  suffix?: ReactNode;
  compact?: boolean;
}

export function TextField({ label, required, hint, error, prefix, suffix, compact, editable = true, onFocus, onBlur, secureTextEntry, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  // Every password box can be shown, to catch a typo before signing in.
  const [shown, setShown] = useState(false);
  return (
    <FieldFrame label={label} required={required} hint={hint} error={error} compact={compact}>
      <View style={[styles.box, !!error && styles.errored, focused && styles.focused, !editable && styles.readonly]}>
        {prefix ? (
          <Text type="body" tone="secondary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          {...input}
          secureTextEntry={!!secureTextEntry && !shown}
          editable={editable}
          accessibilityLabel={input.accessibilityLabel ?? label}
          placeholderTextColor={color.text.disabled}
          selectionColor={color.accent}
          cursorColor={color.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[textStyle('body'), styles.input, { color: editable ? color.text.primary : color.text.secondary }]}
        />
        {secureTextEntry ? (
          <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={4} onPress={() => setShown((v) => !v)} style={({ pressed }) => [styles.eye, pressed && styles.iconBtnPressed]}>
            {shown ? <EyeOff size={20} color={color.icon.secondary} /> : <Eye size={20} color={color.icon.secondary} />}
          </Pressable>
        ) : null}
        {suffix}
      </View>
    </FieldFrame>
  );
}

/** DD/MM/YYYY entry with live masking; emits ISO (YYYY-MM-DD) or undefined while incomplete/invalid. */
export function DateField({ label, required, hint, error, value, onChange }: { label: string; required?: boolean; hint?: string; error?: string; value?: string; onChange: (iso: string | undefined) => void }) {
  const initial = value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '';
  const [text, setText] = useState(initial);
  const [localError, setLocalError] = useState<string | undefined>();
  const onText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
    setText(masked);
    if (digits.length < 8) {
      setLocalError(undefined);
      return onChange(undefined);
    }
    const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
    try {
      onChange(toISODate(parseISODate(iso)));
      setLocalError(undefined);
    } catch {
      setLocalError('That date does not exist');
      onChange(undefined);
    }
  };
  return <TextField label={label} required={required} {...(hint ? { hint } : {})} error={localError ?? error} value={text} onChangeText={onText} keyboardType="number-pad" placeholder="DD/MM/YYYY" maxLength={10} />;
}

/**
 * Astryx BottomSheet: rises on a spring, backdrop fades in; closes downward on the exit curve.
 * Stays mounted until the exit finishes. Reduce Motion: a short cross-fade. Web: at once.
 */
export function BottomSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const mode = useMotionMode();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (mode === 'none') return v.setValue(1);
      if (mode === 'fade') return Animated.timing(v, { toValue: 1, duration: motion.duration.reduced, useNativeDriver: true }).start();
      Animated.spring(v, { toValue: 1, ...motion.spring, useNativeDriver: true }).start();
      return;
    }
    if (mode === 'none') {
      v.setValue(0);
      return setMounted(false);
    }
    Animated.timing(v, { toValue: 0, duration: mode === 'fade' ? motion.duration.reduced : motion.duration.exit, easing: ease.exit, useNativeDriver: true }).start(({ finished }) => finished && setMounted(false));
  }, [visible, mode, v]);
  const move = mode === 'full' ? { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [height, 0], extrapolate: 'clamp' }) }] } : { opacity: v };
  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: v }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, move]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text type="h3" style={{ flex: 1 }}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
              <X size={22} color={color.icon.secondary} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

/** Astryx Selector: a field that opens a bottom-sheet list, with optional search (long lists). */
export function SelectField({ label, required, hint, error, value, options, onChange, placeholder = 'Select', searchable, compact }: { label: string; required?: boolean; hint?: string; error?: string; value?: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string; searchable?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [q, options]);
  return (
    <FieldFrame label={label} required={required} hint={hint} error={error} compact={compact}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [compact ? styles.chip : styles.box, !compact && !!error && styles.errored, pressed && styles.boxPressed]}
      >
        <Text type={compact ? 'supporting' : 'body'} weight={compact ? 'semibold' : undefined} tone={selected ? 'primary' : 'secondary'} numberOfLines={1} {...(compact ? {} : { style: { flex: 1 } })}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={compact ? 16 : 20} color={color.icon.secondary} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        {searchable ? (
          <View style={[styles.box, { marginHorizontal: spacing[4], marginBottom: spacing[2] }]}>
            <Search size={18} color={color.icon.secondary} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={color.text.disabled} selectionColor={color.accent} style={[textStyle('body'), styles.input]} accessibilityLabel="Search" />
          </View>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const on = item.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select();
                  onChange(item.value);
                  setOpen(false);
                  setQ('');
                }}
                style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.boxPressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text type="body" weight={on ? 'semibold' : undefined}>
                    {item.label}
                  </Text>
                  {item.hint ? (
                    <Text type="supporting" tone="secondary">
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                {on ? <Check size={20} color={color.accent} strokeWidth={2.25} /> : null}
              </Pressable>
            );
          }}
        />
      </BottomSheet>
    </FieldFrame>
  );
}

/** One OTP box: the digit pops in as it lands; the active empty box shows a blinking caret. */
const OTP_GAP = spacing[2];

function OtpBox({ ch, active, error, width }: { ch: string; active: boolean; error: boolean; width: number | undefined }) {
  const mode = useMotionMode();
  const pop = useRef(new Animated.Value(1)).current;
  const caret = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ch || mode !== 'full') return;
    pop.setValue(1.12);
    Animated.spring(pop, { toValue: 1, ...motion.spring, useNativeDriver: true }).start();
  }, [ch, mode, pop]);
  useEffect(() => {
    if (!active || ch || mode === 'none') return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(caret, { toValue: 0, duration: 500, delay: 300, useNativeDriver: true }), Animated.timing(caret, { toValue: 1, duration: 200, useNativeDriver: true })]));
    loop.start();
    return () => {
      loop.stop();
      caret.setValue(1);
    };
  }, [active, ch, mode, caret]);
  return (
    <Animated.View pointerEvents="none" style={[styles.otpBox, width ? { width } : styles.fill, !!ch && styles.otpFilled, active && styles.otpActive, error && styles.errored, { transform: [{ scale: pop }] }]}>
      {ch ? <Text type="h3">{ch}</Text> : active ? <Animated.View style={[styles.caret, { opacity: caret }]} /> : null}
    </Animated.View>
  );
}

/**
 * 6-box OTP entry backed by one invisible input laid over the boxes (autofill + paste friendly).
 * A tap lands on the input itself, so the keypad opens even when the keyboard was dismissed while
 * the input still held focus (calling focus() then does nothing on Android).
 */
export function OtpInput({ value, onChange, error, length = 6 }: { value: string; onChange: (v: string) => void; error?: string; length?: number }) {
  const shake = useShake(error);
  // Each box gets the same measured width (flex alone let Android give the first box more, D-143).
  const [rowWidth, setRowWidth] = useState(0);
  const boxWidth = rowWidth ? Math.floor((rowWidth - OTP_GAP * (length - 1)) / length) : undefined;
  return (
    <View style={{ gap: spacing[2] }}>
      <Animated.View style={[styles.otpRow, shake]} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {Array.from({ length }, (_, i) => (
          <OtpBox key={i} ch={value[i] ?? ''} active={i === Math.min(value.length, length - 1)} error={!!error} width={boxWidth} />
        ))}
        <TextInput
          accessibilityLabel="One-time password"
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          caretHidden
          maxLength={length}
          style={styles.otpInput}
        />
      </Animated.View>
      {error ? (
        <Text type="supporting" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  box: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.element,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: color.borderEmphasized,
    backgroundColor: color.background.surface,
  },
  boxPressed: { backgroundColor: color.background.muted },
  eye: { width: touchTarget, height: touchTarget, marginRight: -spacing[3], alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  // The box draws the focus ring, so the browser's own outline is switched off (web preview).
  input: { flex: 1, minWidth: 0, paddingVertical: spacing[2], outlineWidth: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  // Astryx focus: 2 px accent. The border grows inward by 1 px, so padding shrinks by 1 to keep text still.
  focused: { borderColor: color.accent, borderWidth: 2, paddingHorizontal: spacing[3] - 1 },
  chip: { height: 40, flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingHorizontal: spacing[3], borderRadius: radius.full, borderWidth: 1, borderColor: color.borderEmphasized, backgroundColor: color.background.surface },
  errored: { borderColor: color.status.error.solid },
  readonly: { backgroundColor: color.background.muted },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: color.overlay },
  sheet: { maxHeight: '80%', backgroundColor: color.background.surface, borderTopLeftRadius: radius.page, borderTopRightRadius: radius.page, borderCurve: 'continuous', paddingBottom: spacing[8], boxShadow: shadow.high },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.borderEmphasized, marginTop: spacing[2] },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing[4], paddingRight: spacing[2], paddingTop: spacing[2], paddingBottom: spacing[2] },
  iconBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  iconBtnPressed: { backgroundColor: color.overlayPressed },
  option: { minHeight: touchTarget + 8, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4] },
  optionOn: { backgroundColor: color.accentMuted },
  otpRow: { flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  otpBox: { minWidth: 0, height: 56, borderRadius: radius.element, borderCurve: 'continuous', borderWidth: 1.5, borderColor: color.borderInput, alignItems: 'center', justifyContent: 'center', backgroundColor: color.background.surface },
  otpFilled: { borderColor: color.text.secondary },
  // Same box size when active: the ring is drawn with a thicker border, no padding change.
  otpActive: { borderColor: color.accent, borderWidth: 2 },
  caret: { width: 2, height: 24, borderRadius: 1, backgroundColor: color.accent },
  otpInput: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, color: 'transparent' },
});
