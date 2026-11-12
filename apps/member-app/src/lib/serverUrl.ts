// Where the app finds the API. Defaults to the build-time EXPO_PUBLIC_API_URL; can be
// changed at runtime in Demo settings (MA-05) so one APK works with any presenter laptop.
import { Platform } from 'react-native';
import * as storage from './storage';

const KEY = 'tgs.serverUrl';
/**
 * G4 (D-114): demo tools (server switch, demo reset) exist only in development builds. Preview and
 * store builds set EXPO_PUBLIC_DEMO_TOOLS=0, so nobody can point a member's app at another server.
 */
export const DEMO_TOOLS = process.env.EXPO_PUBLIC_DEMO_TOOLS !== '0';
export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'web' ? 'http://localhost:4100' : 'http://10.0.2.2:4100');

let current = DEFAULT_SERVER_URL;

export function getServerUrl(): string {
  return current;
}

export async function loadServerUrl(): Promise<string> {
  try {
    current = (DEMO_TOOLS ? await storage.getItem(KEY) : null) ?? DEFAULT_SERVER_URL;
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
  await storage.setItem(KEY, current);
}
