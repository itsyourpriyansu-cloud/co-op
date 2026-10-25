// Password entry for MA-01 / MA-02 / MA-03 / MB-17: Show / Hide toggle, and a strength meter that runs
// the same D-062 rule as the server (packages/domain checkPassword) so the member sees why before Save.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { checkPassword } from '@tgs/domain';
import { Text, TextField, type TextFieldProps } from '@/ui';
import { color, radius, space } from '@/theme';

export function PasswordField(props: Omit<TextFieldProps, 'secureTextEntry' | 'suffix'>) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!shown}
      suffix={
        <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={12} onPress={() => setShown((s) => !s)}>
          <Text role="captionStrong" tone="link">
            {shown ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      }
    />
  );
}

const LABEL = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** Live meter + the three PW checks. `own` = the member's General No. / Employee ID / mobile (PW-3). */
export function PasswordStrength({ password, own }: { password: string; own?: { generalNo?: string; employeeId?: string; mobile?: string } }) {
  if (!password) return null;
  const r = checkPassword(password, own);
  const tone = !r.ok ? color.status.danger.solid : r.score >= 4 ? color.status.success.solid : r.score === 3 ? color.brand.solid : color.status.warning.solid;
  return (
    <View style={{ gap: space[4] }} accessibilityLiveRegion="polite">
      <View style={styles.meterRow}>
        <View style={styles.bars}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.bar, { backgroundColor: i <= Math.max(1, r.score) ? tone : color.border.subtle }]} />
          ))}
        </View>
        <Text role="captionStrong" style={{ color: tone }}>
          {r.ok ? LABEL[r.score] : 'Not allowed yet'}
        </Text>
      </View>
      <View style={{ gap: space[2] }}>
        {r.checks.map((c) => (
          <View key={c.ruleId} style={styles.check}>
            {c.pass ? <Check size={16} color={color.status.success.fg} /> : <X size={16} color={color.status.danger.fg} />}
            <Text role="caption" tone={c.pass ? 'secondary' : 'danger'} style={{ flex: 1 }}>
              {c.message}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  bars: { flex: 1, flexDirection: 'row', gap: space[2] },
  bar: { flex: 1, height: 6, borderRadius: radius.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
