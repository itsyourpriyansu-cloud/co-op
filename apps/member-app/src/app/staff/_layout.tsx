// Staff area guard (D-101, D-106): console roles only, with the same page permissions as the console router.
import { useEffect, useState } from 'react';
import { Redirect, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { channelForRole, type Permission } from '@tgs/types';
import { MUST_CHANGE_KEY } from '@/components/staff';
import { useAuth } from '@/lib/auth';
import * as storage from '@/lib/storage';
import { EmptyState, Screen } from '@/ui';
import NoAccess from './no-access';
import { color } from '@/theme';

const ROUTE_PERMISSION: Array<[RegExp, Permission]> = [
  [/^\/staff\/home/, 'dashboard.view'],
  [/^\/staff\/queue/, 'queue.view'],
  [/^\/staff\/joining/, 'membership.view'],
  [/^\/staff\/member\/new/, 'members.edit'],
  [/^\/staff\/member\/[^/]+\/edit/, 'members.edit'],
  [/^\/staff\/(members?|change-requests?)/, 'members.view'],
  [/^\/staff\/loan\/new/, 'loans.create'],
  [/^\/staff\/loans?/, 'loans.view'],
  [/^\/staff\/deposit\/new/, 'deposits.open'],
  [/^\/staff\/deposits?/, 'deposits.view'],
  [/^\/staff\/(demand|payments?)/, 'collections.view'],
  [/^\/staff\/reports?/, 'reports.view'],
  [/^\/staff\/settings/, 'settings.view'],
];

export default function StaffLayout() {
  const { ready, session, me, meLoading } = useAuth();
  const pathname = usePathname();
  const [mustChange, setMustChange] = useState(false);
  useEffect(() => {
    void storage.getItem(MUST_CHANGE_KEY).then((v) => setMustChange(!!v));
  }, [session?.user.id]);

  // Wait for the stored token, or the first requests go out signed-out.
  if (!ready) return null;
  if (!session || channelForRole(session.user.role) !== 'console') return <Redirect href="/" />;
  if (mustChange) return <Redirect href="/staff-login?change=1" />;
  // Hold the Stack until the permissions are in: taking a mounted Stack away resets the route to Home.
  if (meLoading) return null;
  const needed = ROUTE_PERMISSION.find(([re]) => re.test(pathname))?.[1];
  if (needed && me && !me.permissions.includes(needed)) return <NoAccess />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas }, animation: 'slide_from_right' }} />;
}

/** SYS-03m: a screen crashed. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <EmptyState icon={TriangleAlert} tone="danger" title="Something went wrong" description="We couldn't show this screen. Your data is safe." action={{ text: 'Try again', onPress: () => void retry() }} />
    </Screen>
  );
}
