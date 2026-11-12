// G4 (D-114): push notifications on Android and iOS for members and staff (one app). The web
// preview has none. Remote push needs a development or store build; Expo Go on Android has no push.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import * as storage from './storage';

const TOKEN_KEY = 'tgs.pushToken';
const supported = Platform.OS === 'android' || Platform.OS === 'ios';

if (supported) {
  // Shown while the app is open too, like WhatsApp does.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

/**
 * After sign-in: asks once for permission and sends this phone's token to the server. Never throws:
 * a member who says no, or a build without an EAS project id, simply gets no pushes.
 */
export async function registerForPush(): Promise<void> {
  if (!supported) return;
  try {
    // Android 13+ shows the permission prompt only once a channel exists.
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Society updates', importance: Notifications.AndroidImportance.HIGH });
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.account.registerPush(token, Platform.OS as 'ios' | 'android');
    await storage.setItem(TOKEN_KEY, token);
  } catch {
    // shortcut: a failed registration is retried at the next sign-in or app start, not sooner.
  }
}

/** Before sign-out, while the session is still valid: this phone stops getting that person's pushes. */
export async function unregisterPush(): Promise<void> {
  if (!supported) return;
  const token = await storage.getItem(TOKEN_KEY);
  if (!token) return;
  await api.account.removePush(token).catch(() => undefined);
  await storage.removeItem(TOKEN_KEY);
}

/** Calls `open` with the notification's link when it is tapped, including the tap that started the app. */
export function onPushTap(open: (link: string) => void): () => void {
  if (!supported) return () => undefined;
  const handle = (r: Notifications.NotificationResponse | null) => {
    const link = (r?.notification.request.content.data as { link?: unknown } | undefined)?.link;
    if (typeof link === 'string' && link.startsWith('/')) open(link);
  };
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    handle(r);
    void Notifications.clearLastNotificationResponseAsync();
  });
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
