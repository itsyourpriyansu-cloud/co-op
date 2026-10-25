// Native mirror of Blend TagV2 + the shared status language (docs/18 §6).
import { StyleSheet, View } from 'react-native';
import { presentStatus, toneToBlendColor, type StatusEntity, type Tone } from '@tgs/design-tokens';
import type { AnyStatus } from '@tgs/types';
import { color, radius, space } from '@/theme';
import { Text } from './Text';

export type TagColor = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'purple';
export type TagType = 'subtle' | 'attentive' | 'noFill';

const ROLE: Record<TagColor, Tone> = { neutral: 'neutral', primary: 'info', success: 'success', warning: 'warning', error: 'danger', purple: 'approval' };

export function Tag({ text, color: c = 'neutral', type = 'subtle', size = 'sm' }: { text: string; color?: TagColor; type?: TagType; size?: 'xs' | 'sm' | 'md' }) {
  const s = color.status[ROLE[c]];
  const bg = type === 'attentive' ? s.solid : type === 'subtle' ? s.bg : 'transparent';
  const fg = type === 'attentive' ? color.text.onBrand : s.fg;
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: type === 'noFill' ? s.border : bg, paddingVertical: size === 'md' ? 4 : 2, paddingHorizontal: size === 'xs' ? space[3] : space[4] }]}>
      <Text role={size === 'md' ? 'label' : 'captionStrong'} style={{ color: fg }}>
        {text}
      </Text>
    </View>
  );
}

/** Status in member language ("Approval (1 of 2)"), same tones as the console. */
export function StatusTag({ entity, status, audience = 'member', size = 'sm' }: { entity: StatusEntity; status: AnyStatus; audience?: 'member' | 'staff'; size?: 'xs' | 'sm' | 'md' }) {
  const { tone, label } = presentStatus(entity, status, audience);
  return <Tag text={label} color={toneToBlendColor[tone] as TagColor} size={size} />;
}

const styles = StyleSheet.create({
  tag: { borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
});
