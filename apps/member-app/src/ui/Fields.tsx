// Form fields (native mirrors of Blend TextInputV2 / SingleSelectV2): label above, hint below,
// error replaces hint, 48 dp targets, required marker (docs/12 §5, docs/18 §7).
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { parseISODate, toISODate } from '@tgs/domain';
import { color, radius, space, textStyle, touchTarget } from '@/theme';
import { Text } from './Text';

interface FieldFrameProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldFrame({ label, required, hint, error, children }: FieldFrameProps) {
  return (
    <View style={{ gap: space[3] }}>
      <Text role="label">
        {label}
        {required ? <Text role="label" tone="danger"> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text role="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text role="caption" tone="tertiary">
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
}

export function TextField({ label, required, hint, error, prefix, suffix, editable = true, onFocus, onBlur, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldFrame label={label} required={required} hint={hint} error={error}>
      <View style={[styles.box, focused && styles.focused, !!error && styles.errored, !editable && styles.readonly]}>
        {prefix ? (
          <Text role="body" tone="tertiary">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          {...input}
          editable={editable}
          accessibilityLabel={label}
          placeholderTextColor={color.text.disabled}
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
  return <TextField label={label} required={required} hint={hint ?? 'DD/MM/YYYY'} error={localError ?? error} value={text} onChangeText={onText} keyboardType="number-pad" placeholder="DD/MM/YYYY" maxLength={10} />;
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

/** Bottom-sheet picker with optional search (long lists: departments, designations). */
export function SelectField({ label, required, hint, error, value, options, onChange, placeholder = 'Select', searchable }: { label: string; required?: boolean; hint?: string; error?: string; value?: string; options: SelectOption[]; onChange: (v: string) => void; placeholder?: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options), [q, options]);
  return (
    <FieldFrame label={label} required={required} hint={hint} error={error}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`} onPress={() => setOpen(true)} style={[styles.box, !!error && styles.errored]}>
        <Text role="body" tone={selected ? 'primary' : 'disabled'} style={{ flex: 1 }} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={20} color={color.text.tertiary} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text role="cardTitle" style={{ flex: 1 }}>
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)} style={styles.iconBtn}>
              <X size={22} color={color.text.secondary} />
            </Pressable>
          </View>
          {searchable ? (
            <View style={[styles.box, { marginHorizontal: space[8], marginBottom: space[4] }]}>
              <Search size={18} color={color.text.tertiary} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={color.text.disabled} style={[textStyle('body'), styles.input]} accessibilityLabel="Search" />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQ('');
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: color.bg.surfaceMuted }]}
              >
                <View style={{ flex: 1 }}>
                  <Text role="body">{item.label}</Text>
                  {item.hint ? (
                    <Text role="caption" tone="tertiary">
                      {item.hint}
                    </Text>
                  ) : null}
                </View>
                {item.value === value ? <Check size={20} color={color.brand.solid} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </FieldFrame>
  );
}

/** 6-box OTP entry backed by one hidden input (autofill + paste friendly). */
export function OtpInput({ value, onChange, error, length = 6 }: { value: string; onChange: (v: string) => void; error?: string; length?: number }) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <View style={{ gap: space[4] }}>
      <Pressable onPress={() => ref.current?.focus()} style={styles.otpRow} accessibilityLabel="One-time password">
        {Array.from({ length }, (_, i) => {
          const ch = value[i] ?? '';
          const active = i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[styles.otpBox, active && styles.focused, !!error && styles.errored]}>
              <Text role="metricSm">{ch}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        style={styles.hidden}
      />
      {error ? (
        <Text role="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingHorizontal: space[6],
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border.strong,
    backgroundColor: color.bg.surface,
  },
  // The box draws the focus ring, so the browser's own outline is switched off (web preview).
  input: { flex: 1, paddingVertical: space[5], outlineWidth: 0 },
  focused: { borderColor: color.border.focus, borderWidth: 2 },
  errored: { borderColor: color.status.danger.solid },
  readonly: { backgroundColor: color.bg.surfaceMuted },
  backdrop: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: { maxHeight: '75%', backgroundColor: color.bg.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingBottom: space[12] },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[8], paddingTop: space[8], paddingBottom: space[4] },
  iconBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  option: { minHeight: touchTarget + 8, flexDirection: 'row', alignItems: 'center', gap: space[6], paddingHorizontal: space[8] },
  otpRow: { flexDirection: 'row', gap: space[4], justifyContent: 'space-between' },
  otpBox: { flex: 1, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.surface },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
