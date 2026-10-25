// MA-05 Hidden demo settings (prototype only): server URL, reset demo data.
import { useState } from 'react';
import { Alert as RNAlert, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { RotateCcw, Server } from 'lucide-react-native';
import { createApiClient, isApiError } from '@tgs/api-client';
import { formatDisplayDate } from '@tgs/domain';
import { api } from '@/lib/api';
import { getServerUrl, normaliseServerUrl, saveServerUrl } from '@/lib/serverUrl';
import { Alert, Button, Card, Header, Screen, Text, TextField } from '@/ui';
import { space } from '@/theme';

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
    RNAlert.alert('Reset demo data?', 'This restores the original demo data for every user and device.', [
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
    ]);

  return (
    <Screen header={<Header title="Demo settings" onBack={() => router.back()} />}>
      <Card>
        <View style={{ gap: space[8] }}>
          <TextField label="Server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="The laptop address printed by `npm run demo`, e.g. http://192.168.1.10:4000" />
          <Button text="Test & save" leftSlot={Server} fullWidth loading={busy} onPress={() => void testAndSave()} />
        </View>
      </Card>
      {status ? <Alert type={status.ok ? 'success' : 'error'} heading={status.text} /> : null}
      <Card>
        <View style={{ gap: space[6] }}>
          <Text role="cardTitle">Demo data</Text>
          <Text role="caption" tone="secondary">
            Restore the original fictional members, loans and deposits.
          </Text>
          <Button text="Reset demo data" leftSlot={RotateCcw} buttonType="secondary" fullWidth onPress={reset} />
        </View>
      </Card>
      <Text role="caption" tone="tertiary">
        App version {Constants.expoConfig?.version ?? '—'}
      </Text>
    </Screen>
  );
}
