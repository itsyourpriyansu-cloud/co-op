// G4 (D-114): two things every screen needs, mounted once in the root layout.
// UpdateGate: an app older than the Admin's "Oldest version allowed" shows only an update screen.
// PushTaps: tapping a notification opens what it is about (the staff screens for staff).
import { useEffect, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react-native';
import { isAppVersionAllowed } from '@tgs/domain';
import { channelForRole } from '@tgs/types';
import { staffHref } from '@/components/staff';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { onPushTap } from '@/lib/push';
import { EmptyState, Screen } from '@/ui';

const storeUrl = () => (Platform.OS === 'ios' ? 'itms-apps://apps.apple.com/' : `https://play.google.com/store/apps/details?id=${Application.applicationId ?? 'in.tgseccsl.member'}`);

export function UpdateGate({ children }: { children: ReactNode }) {
  // Fails open: if the server cannot be reached, the app's own offline handling takes over.
  const q = useQuery({ queryKey: ['app-config'], queryFn: api.appConfig, enabled: Platform.OS !== 'web', staleTime: 30 * 60_000, retry: false });
  const current = Application.nativeApplicationVersion;
  if (q.data && !isAppVersionAllowed(current, q.data.minAppVersion)) {
    return (
      <Screen>
        <EmptyState
          icon={Download}
          title="Please update the app"
          description={`This version (${current}) is no longer supported. Update to ${q.data.minAppVersion} or newer from the ${Platform.OS === 'ios' ? 'App Store (search TGSECCSL)' : 'Play Store'} to continue.`}
          action={{ text: 'Update now', onPress: () => void Linking.openURL(storeUrl()) }}
        />
      </Screen>
    );
  }
  return <>{children}</>;
}

export function PushTaps() {
  const { session } = useAuth();
  const staff = !!session && channelForRole(session.user.role) === 'console';
  useEffect(() => onPushTap((link) => router.push((staff ? staffHref(link) : link) as Href)), [staff]);
  return null;
}
