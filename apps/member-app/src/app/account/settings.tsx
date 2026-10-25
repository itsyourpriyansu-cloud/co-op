// MB-14 Settings: where society messages reach you (SMS / WhatsApp / Email; in-app is always on),
// language (English; Telugu is Q-008), and account links. Saving is immediate per switch.
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Mail, MessageCircle, MessageSquareText, Smartphone, type LucideIcon } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { MemberPreferences } from '@tgs/types';
import { api } from '@/lib/api';
import { accountKeys, usePreferences } from '@/lib/account';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, Skeleton, Tag, Text } from '@/ui';
import { color, radius, space, touchTarget } from '@/theme';

type Channel = keyof MemberPreferences['channels'];
const CHANNELS: Array<{ key: Channel; icon: LucideIcon; label: string; detail: (p: MemberPreferences) => string }> = [
  { key: 'SMS', icon: MessageSquareText, label: 'SMS', detail: () => 'To your registered mobile' },
  { key: 'WHATSAPP', icon: MessageCircle, label: 'WhatsApp', detail: () => 'To your registered mobile' },
  { key: 'EMAIL', icon: Mail, label: 'Email', detail: (p) => p.email ?? 'No email on your profile' },
];

export default function SettingsScreen() {
  const qc = useQueryClient();
  const q = usePreferences();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState<Channel>();

  const toggle = async (key: Channel, value: boolean) => {
    setSaving(key);
    setError(undefined);
    try {
      const next = await api.account.savePreferences({ channels: { ...q.data!.channels, [key]: value } });
      qc.setQueryData(accountKeys.preferences, next);
      void qc.invalidateQueries({ queryKey: accountKeys.notifications });
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setError(isApiError(e) ? (e.fieldErrors?.[key] ?? e.message) : 'Could not save.');
    } finally {
      setSaving(undefined);
    }
  };

  return (
    <Screen header={<Header title="Settings" onBack={() => router.back()} />}>
      {q.isLoading ? (
        <Skeleton height={220} radius={radius.card} />
      ) : q.isError || !q.data ? (
        <Alert type="error" heading="Couldn't load your settings" action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <>
          <Section title="Where we reach you" description="You always get messages here in the app. Choose where else to receive them.">
            <Card padded={false}>
              <View style={styles.row}>
                <Smartphone size={22} color={color.text.secondary} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="body">In the app</Text>
                  <Text role="caption" tone="secondary">
                    Notifications tab
                  </Text>
                </View>
                <Tag text="Always on" size="xs" />
              </View>
              {CHANNELS.map((c) => (
                <View key={c.key} style={[styles.row, styles.divider]}>
                  <c.icon size={22} color={color.text.secondary} strokeWidth={1.75} />
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text role="body">{c.label}</Text>
                    <Text role="caption" tone="secondary">
                      {c.detail(q.data)}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={`${c.label} messages`}
                    value={q.data.channels[c.key]}
                    disabled={saving !== undefined}
                    onValueChange={(v) => void toggle(c.key, v)}
                    trackColor={{ true: color.brand.solid, false: color.border.strong }}
                    thumbColor={color.bg.surface}
                    // react-native-web colours the thumb separately when on.
                    {...({ activeThumbColor: color.bg.surface } as object)}
                  />
                </View>
              ))}
            </Card>
            {error ? <Alert type="error" heading="Not saved" description={error} action={error.includes('Profile') ? { text: 'Edit profile', onPress: () => router.push('/profile/edit') } : undefined} /> : null}
            <Text role="caption" tone="tertiary">
              Demo build: nothing is really sent. The Notifications tab shows where each message would have gone.
            </Text>
          </Section>

          <Section title="Language">
            <Card>
              <KeyValue label="App language" value="English" />
              <Text role="caption" tone="tertiary">
                Telugu is planned once the society confirms the wording.
              </Text>
            </Card>
          </Section>

          <Section title="Security">
            <Button text="Change password" leftSlot={KeyRound} buttonType="secondary" fullWidth onPress={() => router.push('/account/password')} />
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: touchTarget + 16, paddingHorizontal: space[8], paddingVertical: space[4] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
