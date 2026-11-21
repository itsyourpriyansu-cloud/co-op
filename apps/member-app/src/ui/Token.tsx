// Astryx Token (status chips) + StatusToken, the shared status language in member words (docs/18 §6).
// Status wording and tone still come from @tgs/design-tokens/status, shared with the console (docs/25 §7).
import { StyleSheet, View } from 'react-native';
import { presentStatus, type StatusEntity, type Tone } from '@tgs/design-tokens';
import type { AnyStatus } from '@tgs/types';
import { color, radius, spacing, type StatusName } from '@/theme';
import { Text } from './Text';

export type TokenEmphasis = 'subtle' | 'strong' | 'outline';
type TokenSize = 'xs' | 'sm' | 'md';

export function Token({ text, status = 'neutral', emphasis = 'subtle', size = 'sm', dot }: { text: string; status?: StatusName; emphasis?: TokenEmphasis; size?: TokenSize; dot?: boolean }) {
  const s = color.status[status];
  const bg = emphasis === 'strong' ? s.solid : emphasis === 'subtle' ? s.tint : 'transparent';
  const fg = emphasis === 'strong' ? s.onSolid : s.text;
  return (
    <View style={[styles.token, { backgroundColor: bg, borderColor: emphasis === 'strong' ? bg : s.border, paddingVertical: size === 'md' ? spacing[1] : 2, paddingHorizontal: size === 'xs' ? spacing[1.5] : spacing[2] }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: emphasis === 'strong' ? s.onSolid : s.solid }]} /> : null}
      <Text type="supporting" weight="semibold" style={{ color: fg }}>
        {text}
      </Text>
    </View>
  );
}

const TONE_STATUS: Record<Tone, StatusName> = { neutral: 'neutral', info: 'info', warning: 'warning', success: 'success', danger: 'error', approval: 'approval' };

/** Status in member language ("Approval (1 of 2)"), same tones as the console, led by a status dot. */
export function StatusToken({ entity, status, audience = 'member', size = 'sm' }: { entity: StatusEntity; status: AnyStatus; audience?: 'member' | 'staff'; size?: TokenSize }) {
  const { tone, label } = presentStatus(entity, status, audience);
  return <Token text={label} status={TONE_STATUS[tone]} size={size} dot />;
}

const styles = StyleSheet.create({
  token: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5], borderRadius: radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
