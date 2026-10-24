import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { RotateCcw, Server, WifiOff } from 'lucide-react-native';
import { AppButton, AppText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { getServerUrl } from '@/lib/serverUrl';
import { c, space } from '@/theme';

/** MA-04 Offline / server unreachable. */
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
    <Screen style={styles.page}>
      <View style={styles.icon}>
        <WifiOff size={36} color={c.primary} strokeWidth={1.75} />
      </View>
      <AppText variant="title" style={styles.center}>
        Can't reach the society server
      </AppText>
      <AppText variant="muted" style={styles.center}>
        Check that your phone is on the same Wi-Fi as the demo laptop.{'\n'}Server: {getServerUrl()}
      </AppText>
      {stillDown && (
        <AppText style={[styles.center, { color: c.danger }]} accessibilityRole="alert">
          Still unreachable. Is `npm run demo` running on the laptop?
        </AppText>
      )}
      <AppButton label="Try again" icon={RotateCcw} onPress={retry} loading={checking} />
      <AppButton
        label="Change server"
        icon={Server}
        variant="outline"
        onPress={() => router.push('/demo-settings')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center' },
  icon: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  center: { textAlign: 'center' },
});
