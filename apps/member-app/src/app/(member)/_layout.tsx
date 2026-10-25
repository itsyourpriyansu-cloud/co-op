import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import {
  HandCoins,
  House,
  Menu,
  PiggyBank,
  ReceiptIndianRupee,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { color } from '@/theme';

// Bottom bar: 5 equal destinations (docs/12 §2.2). Only members get here (D-033).
const tab = (title: string, Icon: LucideIcon) => ({
  title,
  tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) => (
    <Icon color={focused ? color.brand.solid : color.text.tertiary} size={size} strokeWidth={1.75} />
  ),
});

export default function MemberLayout() {
  const { ready, session } = useAuth();
  if (ready && session?.user.role !== 'MEMBER') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand.solid,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarStyle: { backgroundColor: color.bg.surface, borderTopColor: color.border.default, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
      }}
    >
      <Tabs.Screen name="home" options={tab('Home', House)} />
      <Tabs.Screen name="loans" options={tab('Loans', HandCoins)} />
      <Tabs.Screen name="deposits" options={tab('Deposits', PiggyBank)} />
      <Tabs.Screen name="payments" options={tab('Payments', ReceiptIndianRupee)} />
      <Tabs.Screen name="more" options={tab('More', Menu)} />
    </Tabs>
  );
}
