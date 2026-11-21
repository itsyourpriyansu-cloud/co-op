import { useEffect, useState } from 'react';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, useFonts } from '@expo-google-fonts/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isApiError } from '@tgs/api-client';
import { PushTaps, UpdateGate } from '@/components/AppGate';
import { LaunchPoster } from '@/components/LaunchPoster';
import { AuthProvider } from '@/lib/auth';
import { color } from '@/theme';

// Keep the splash up until Figtree is ready, so text never flashes in the wrong font.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold });
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (count, error) => count < 2 && (!isApiError(error) || error.code === 'NETWORK') },
        },
      }),
  );

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <UpdateGate>
            <PushTaps />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background.body }, animation: 'ios_from_right' }} />
          </UpdateGate>
          <LaunchPoster />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
