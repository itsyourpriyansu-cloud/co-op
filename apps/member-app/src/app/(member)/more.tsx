// More tab = the sitemap's "Settings / Index" (docs/17, docs/06 v0.4). Everything is live from M8.
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bell, Calculator, ChevronRight, FlaskConical, Handshake, KeyRound, LifeBuoy, LogOut, Percent, Settings, UserRound, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { Card, Screen, Text } from '@/ui';
import { color, space, touchTarget } from '@/theme';

const items: Array<{ icon: LucideIcon; label: string; href: Href }> = [
  { icon: UserRound, label: 'Profile & agreements', href: '/profile' },
  { icon: Bell, label: 'Notifications', href: '/account/notifications' },
  { icon: Calculator, label: 'Calculators', href: '/account/calculators' },
  { icon: Percent, label: 'Interest rates', href: '/rates' },
  { icon: Handshake, label: 'Surety requests', href: '/surety' },
  { icon: LifeBuoy, label: 'Help & support', href: '/account/help' },
  { icon: Settings, label: 'Settings', href: '/account/settings' },
  { icon: KeyRound, label: 'Change password', href: '/account/password' },
];

export default function More() {
  const { logout } = useAuth();
  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };
  return (
    <Screen>
      <Text role="pageTitle">More</Text>
      <Card padded={false}>
        {items.map((item, i) => (
          <Row key={item.label} icon={item.icon} label={item.label} onPress={() => router.push(item.href)} divider={i > 0} />
        ))}
      </Card>
      <Card padded={false}>
        <Row icon={FlaskConical} label="Demo settings" onPress={() => router.push('/demo-settings')} />
        <Row icon={LogOut} label="Sign out" onPress={() => void signOut()} danger divider />
      </Card>
    </Screen>
  );
}

function Row({ icon: Icon, label, onPress, danger, divider }: { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean; divider?: boolean }) {
  const tint = danger ? color.status.danger.fg : color.text.primary;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
      <Icon size={22} color={tint} strokeWidth={1.75} />
      <Text role="body" style={{ flex: 1, color: tint }}>
        {label}
      </Text>
      {!danger ? <ChevronRight size={20} color={color.text.tertiary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: touchTarget + 8, paddingHorizontal: space[8] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
