import { Tabs } from 'expo-router/tabs';
import { ChartColumn, FileSpreadsheet, HandCoins, Inbox, LayoutDashboard, Menu, PiggyBank, ReceiptIndianRupee, UserPlus, Users, type LucideIcon } from 'lucide-react-native';
import { TABS_BY_ROLE } from '@/components/staff';
import { useAuth } from '@/lib/auth';
import { color } from '@/theme';

// Same bar as the member tabs. Five show per role; the rest stay reachable from More (docs/23 §4.3).
const ALL: Array<[name: string, title: string, Icon: LucideIcon]> = [
  ['home', 'Home', LayoutDashboard],
  ['queue', 'Queue', Inbox],
  ['members', 'Members', Users],
  ['joining', 'Joining', UserPlus],
  ['payments', 'Payments', ReceiptIndianRupee],
  ['loans', 'Loans', HandCoins],
  ['deposits', 'Deposits', PiggyBank],
  ['demand', 'Demand', FileSpreadsheet],
  ['reports', 'Reports', ChartColumn],
  ['more', 'More', Menu],
];

export default function StaffTabs() {
  const { session } = useAuth();
  const shown = (session && TABS_BY_ROLE[session.user.role]) || [];
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand.solid,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarStyle: { backgroundColor: color.bg.surface, borderTopColor: color.border.default, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
      }}
    >
      {ALL.map(([name, title, Icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            // Not `href: null`: Expo Router 58 redirects those away, and these must stay reachable from More.
            ...(shown.includes(name) ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } }),
            tabBarIcon: ({ focused, size }: { focused: boolean; size: number }) => <Icon color={focused ? color.brand.solid : color.text.tertiary} size={size} strokeWidth={1.75} />,
          }}
        />
      ))}
    </Tabs>
  );
}
