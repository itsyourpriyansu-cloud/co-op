// G4 (D-114): staff screens lock after time away. A staff phone can sanction loans and post money,
// so whoever picks it up must pass the phone's own fingerprint, face or PIN first. Members are not locked.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

/** Locked after this long in the background, and on every cold start. */
export const LOCK_AFTER_MS = 5 * 60_000;
const native = Platform.OS === 'android' || Platform.OS === 'ios';

/** When the staff screens were last in use; 0 = not since the app started. */
let lastActive = 0;

/** Signing in proves who it is, so no lock straight after it. */
export function markStaffActive(): void {
  lastActive = Date.now();
}

/** False when the phone has no fingerprint, face or screen PIN set: nothing to ask for. */
async function canAsk(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE)) !== LocalAuthentication.SecurityLevel.NONE;
}

export function useStaffLock(active: boolean) {
  const [locked, setLocked] = useState(false);

  const check = useCallback(async () => {
    if (!active || !native) return;
    // shortcut: a phone with no screen lock at all cannot be asked; the short staff sign-in (7 days) is the guard there.
    if (Date.now() - lastActive >= LOCK_AFTER_MS && (await canAsk())) setLocked(true);
    else markStaffActive();
  }, [active]);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
      else markStaffActive();
    });
    return () => sub.remove();
  }, [check]);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock TGSECCSL staff', cancelLabel: 'Cancel' });
    if (r.success) {
      markStaffActive();
      setLocked(false);
    }
    return r.success;
  }, []);

  return { locked, unlock };
}
