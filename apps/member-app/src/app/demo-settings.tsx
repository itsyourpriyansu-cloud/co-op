import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ArrowLeft, CircleCheck, RotateCcw, Server } from 'lucide-react-native';
import { createApiClient, isApiError } from '@tgs/api-client';
import { formatDisplayDate } from '@tgs/domain';
import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { getServerUrl, normaliseServerUrl, saveServerUrl } from '@/lib/serverUrl';
import { c, radius, space, touchTarget } from '@/theme';

/** MA-05 Hidden demo settings (prototype only): server URL, reset demo data. */
export default function DemoSettings() {
  const [url, setUrl] = useState(getServerUrl());
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const testAndSave = async () => {
    setBusy(true);
    setStatus(null);
    const candidate = normaliseServerUrl(url);
    try {
      // Validate before saving, so a typo never strands the app (docs/07 §5).
      const health = await createApiClient({ baseUrl: candidate, timeoutMs: 5000 }).health();
      await saveServerUrl(candidate);
      setUrl(candidate);
      setStatus({ ok: true, text: `Connected. Demo date ${formatDisplayDate(health.today)}.` });
    } catch (e) {
      setStatus({ ok: false, text: isApiError(e) ? e.message : 'Could not connect.' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () =>
    Alert.alert(
      'Reset demo data?',
      'This restores the original demo data for every user and device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.demo.reset();
              setStatus({ ok: true, text: 'Demo data reset.' });
            } catch (e) {
              setStatus({ ok: false, text: isApiError(e) ? e.message : 'Reset failed.' });
            }
          },
        },
      ],
    );

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      >
        <ArrowLeft size={22} color={c.text} />
      </Pressable>
      <AppText variant="title">Demo settings</AppText>

      <Card style={{ gap: space[3] }}>
        <AppText variant="heading">Server</AppText>
        <AppText variant="muted">
          Use the laptop address printed by `npm run demo`, e.g. http://192.168.1.10:4000
        </AppText>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Server address"
          style={styles.input}
        />
        <AppButton label="Test & save" icon={Server} onPress={testAndSave} loading={busy} />
        {status && (
          <View style={styles.status}>
            {status.ok && <CircleCheck size={18} color={c.success} />}
            <AppText style={{ color: status.ok ? c.success : c.danger, flex: 1 }}>
              {status.text}
            </AppText>
          </View>
        )}
      </Card>

      <Card style={{ gap: space[3] }}>
        <AppText variant="heading">Demo data</AppText>
        <AppText variant="muted">
          Restore the original fictional members, loans and deposits.
        </AppText>
        <AppButton label="Reset demo data" icon={RotateCcw} variant="outline" onPress={reset} />
      </Card>

      <AppText variant="caption">App version {Constants.expoConfig?.version ?? '—'}</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 48, height: 48, justifyContent: 'center' },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    fontSize: 16,
    color: c.text,
    backgroundColor: c.background,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
