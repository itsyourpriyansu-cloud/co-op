// More tab = the sitemap's "Settings / Index" (docs/17, docs/06 v0.4). Everything is live from M8.
import { router, type Href } from 'expo-router';
import { Bell, Calculator, FlaskConical, Handshake, LifeBuoy, LogOut, Percent, Settings, UserRound, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { Card, ListRow, Screen, Text } from '@/ui';
import { DEMO_TOOLS } from '@/lib/serverUrl';

const items: Array<{ icon: LucideIcon; label: string; href: Href }> = [
  { icon: UserRound, label: 'Profile & agreements', href: '/profile' },
  { icon: Bell, label: 'Notifications', href: '/account/notifications' },
  { icon: Calculator, label: 'Calculators', href: '/account/calculators' },
  { icon: Percent, label: 'Interest rates', href: '/rates' },
  { icon: Handshake, label: 'Surety requests', href: '/surety' },
  { icon: LifeBuoy, label: 'Help & support', href: '/account/help' },
  { icon: Settings, label: 'Settings', href: '/account/settings' },
];

export default function More() {
  const { logout } = useAuth();
  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };
  return (
    <Screen>
      <Text type="h1">More</Text>
      <Card padded={false}>
        {items.map((item, i) => (
          <ListRow key={item.label} icon={item.icon} label={item.label} onPress={() => router.push(item.href)} divider={i > 0} />
        ))}
      </Card>
      <Card padded={false}>
        {DEMO_TOOLS ? <ListRow icon={FlaskConical} label="Demo settings" onPress={() => router.push('/demo-settings')} /> : null}
        <ListRow icon={LogOut} label="Sign out" onPress={() => void signOut()} danger divider={DEMO_TOOLS} />
      </Card>
    </Screen>
  );
}
