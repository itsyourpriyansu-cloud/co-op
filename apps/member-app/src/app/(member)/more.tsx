import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Bell,
  Calculator,
  ChevronRight,
  FlaskConical,
  Handshake,
  LifeBuoy,
  LogOut,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c, space, touchTarget } from '@/theme';

const items: Array<{ icon: LucideIcon; label: string; milestone: string }> = [
  { icon: UserRound, label: 'My profile & agreements', milestone: 'M3' },
  { icon: Handshake, label: 'Surety requests', milestone: 'M5' },
  { icon: Calculator, label: 'Calculators', milestone: 'M8' },
  { icon: Bell, label: 'Notifications', milestone: 'M8' },
  { icon: LifeBuoy, label: 'Help & support', milestone: 'M8' },
  { icon: Settings, label: 'Settings', milestone: 'M8' },
];

export default function More() {
  const { logout } = useAuth();

  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };

  return (
    <Screen>
      <AppText variant="title">More</AppText>
      <Card style={{ paddingVertical: space[1] }}>
        {items.map((item, i) => (
          <View
            key={item.label}
            style={[styles.row, i > 0 && styles.divider]}
            accessible
            accessibilityState={{ disabled: true }}
          >
            <item.icon size={22} color={c.textMuted} strokeWidth={1.75} />
            <AppText style={{ flex: 1 }}>{item.label}</AppText>
            <AppText variant="caption">{item.milestone}</AppText>
          </View>
        ))}
      </Card>

      <Card style={{ paddingVertical: space[1] }}>
        <Row
          icon={FlaskConical}
          label="Demo settings"
          onPress={() => router.push('/demo-settings')}
        />
        <Row icon={LogOut} label="Sign out" onPress={signOut} danger divider />
      </Card>
    </Screen>
  );
}

function Row({
  icon: Icon,
  label,
  onPress,
  danger,
  divider,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  danger?: boolean;
  divider?: boolean;
}) {
  const color = danger ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { opacity: 0.6 }]}
    >
      <Icon size={22} color={color} strokeWidth={1.75} />
      <AppText style={{ flex: 1, color }}>{label}</AppText>
      {!danger && <ChevronRight size={20} color={c.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: touchTarget + 8 },
  divider: { borderTopWidth: 1, borderTopColor: c.border },
});
