// Small key-value store: device keystore on Android, localStorage in the web preview
// (expo-secure-store has no web implementation).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) return globalThis.localStorage?.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (web) return globalThis.localStorage?.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}
