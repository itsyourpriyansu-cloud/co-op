// MA-04 Offline / server unreachable.
import { useState } from 'react';
import { router } from 'expo-router';
import { RotateCcw, Server, WifiOff } from 'lucide-react-native';
import { api } from '@/lib/api';
import { getServerUrl } from '@/lib/serverUrl';
import { Alert, Button, EmptyState, Screen } from '@/ui';

export default function Offline() {
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);

  const retry = async () => {
    setChecking(true);
    setStillDown(false);
    try {
      await api.health();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setStillDown(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button text="Try again" leftSlot={RotateCcw} size="lg" fullWidth loading={checking} onPress={() => void retry()} />
          <Button text="Change server" leftSlot={Server} buttonType="secondary" size="lg" fullWidth onPress={() => router.push('/demo-settings')} />
        </>
      }
    >
      <EmptyState icon={WifiOff} tone="warning" title="Can't reach the society server" description={`Check that your phone is on the same Wi-Fi as the demo laptop.\nServer: ${getServerUrl()}`} />
      {stillDown ? <Alert type="error" heading="Still unreachable" description="Is `npm run demo` running on the laptop?" /> : null}
    </Screen>
  );
}
