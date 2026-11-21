// MB-14 Settings: where society messages reach you (WhatsApp / Email; in-app is always on),
// language (English; Telugu is Q-008), and account links. Saving is immediate per switch.
import { useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MessageCircle,
  MessageSquareText,
  Smartphone,
  type LucideIcon,
} from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { MemberPreferences } from '@tgs/types';
import { consoleUrl } from '@/components/staff';
import { api } from '@/lib/api';
import { accountKeys, usePreferences } from '@/lib/account';
import { Banner, Button, Card, Header, MetadataListItem, Screen, Section, Skeleton, Token, Text } from '@/ui';
import { color, radius, touchTarget, spacing } from '@/theme';

type Channel = keyof MemberPreferences['channels'];
const CHANNELS: Array<{
  key: Channel;
  icon: LucideIcon;
  label: string;
  detail: (p: MemberPreferences) => string;
}> = [
  {
    key: 'WHATSAPP',
    icon: MessageCircle,
    label: 'WhatsApp',
    detail: () => 'To your registered mobile',
  },
  {
    key: 'EMAIL',
    icon: Mail,
    label: 'Email',
    detail: (p) => p.email ?? 'No email on your profile',
  },
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
      const next = await api.account.savePreferences({
        channels: { ...q.data!.channels, [key]: value },
      });
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
        <Skeleton height={220} radius={radius.container} />
      ) : q.isError || !q.data ? (
        <Banner
          status="error"
          heading="Couldn't load your settings"
          action={{ text: 'Try again', onPress: () => void q.refetch() }}
        />
      ) : (
        <>
          <Section
            title="Where we reach you"
            description="You always get messages here in the app. Choose where else to receive them."
          >
            <Card padded={false}>
              <View style={styles.row}>
                <Smartphone size={22} color={color.text.secondary} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="body">In the app</Text>
                  <Text type="supporting" tone="secondary">
                    Notifications tab
                  </Text>
                </View>
                <Token text="Always on" size="xs" />
              </View>
              {CHANNELS.map((c) => (
                <View key={c.key} style={[styles.row, styles.divider]}>
                  <c.icon size={22} color={color.text.secondary} strokeWidth={1.75} />
                  <View style={{ flex: 1, gap: spacing[0.5] }}>
                    <Text type="body">{c.label}</Text>
                    <Text type="supporting" tone="secondary">
                      {c.detail(q.data)}
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel={`${c.label} messages`}
                    value={q.data.channels[c.key]}
                    disabled={saving !== undefined}
                    onValueChange={(v) => void toggle(c.key, v)}
                    trackColor={{ true: color.accent, false: color.borderEmphasized }}
                    thumbColor={color.background.surface}
                    // react-native-web colours the thumb separately when on.
                    {...({ activeThumbColor: color.background.surface } as object)}
                  />
                </View>
              ))}
            </Card>
            {error ? (
              <Banner
                status="error"
                heading="Not saved"
                description={error}
                action={
                  error.includes('Profile')
                    ? { text: 'Edit profile', onPress: () => router.push('/profile/edit') }
                    : undefined
                }
              />
            ) : null}
            <Text type="supporting" tone="secondary">
              Everything also appears in the Notifications tab, whichever channels are on. Receipts
              and a change of your mobile number always come on WhatsApp too, for your safety.
            </Text>
          </Section>

          <Section title="Language">
            <Card>
              <MetadataListItem label="App language" value="English" />
              <Text type="supporting" tone="secondary">
                Telugu is planned once the society confirms the wording.
              </Text>
            </Card>
          </Section>

          <Section title="Account">
            <Button
              label="Privacy notice"
              variant="secondary"
              fullWidth
              onPress={() => void Linking.openURL(consoleUrl('/privacy'))}
            />
            <Button
              label="Delete my account"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/account/delete')}
            />
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: touchTarget + 16,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
});
