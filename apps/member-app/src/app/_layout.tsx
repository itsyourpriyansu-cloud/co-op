import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isApiError } from '@tgs/api-client';
import { AuthProvider } from '@/lib/auth';
import { c } from '@/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, error) => count < 2 && (!isApiError(error) || error.code === 'NETWORK'),
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
