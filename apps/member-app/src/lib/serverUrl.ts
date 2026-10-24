// Where the app finds the API. Defaults to the build-time EXPO_PUBLIC_API_URL; can be
// changed at runtime in Demo settings (MA-05) so one APK works with any presenter laptop.
import * as SecureStore from 'expo-secure-store';

const KEY = 'tgs.serverUrl';
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

let current = DEFAULT_SERVER_URL;

export function getServerUrl(): string {
  return current;
}

export async function loadServerUrl(): Promise<string> {
  try {
    current = (await SecureStore.getItemAsync(KEY)) ?? DEFAULT_SERVER_URL;
  } catch {
    current = DEFAULT_SERVER_URL;
  }
  return current;
}

export function normaliseServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function saveServerUrl(url: string): Promise<void> {
  current = normaliseServerUrl(url);
  await SecureStore.setItemAsync(KEY, current);
}
