import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { HandCoins, House, Menu, PiggyBank, ReceiptIndianRupee, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { tabBarListeners, tabBarOptions, tabIcon } from '@/ui';

// Bottom bar: 5 equal destinations (docs/12 §2.2). Only members get here (D-033).
const tab = (title: string, Icon: LucideIcon) => ({ title, tabBarIcon: tabIcon(Icon) });

export default function MemberLayout() {
  const { ready, session } = useAuth();
  if (ready && session?.user.role !== 'MEMBER') return <Redirect href="/" />;

  return (
    <Tabs screenOptions={tabBarOptions} screenListeners={tabBarListeners}>
      <Tabs.Screen name="home" options={tab('Home', House)} />
      <Tabs.Screen name="loans" options={tab('Loans', HandCoins)} />
      <Tabs.Screen name="deposits" options={tab('Deposits', PiggyBank)} />
      <Tabs.Screen name="payments" options={tab('Payments', ReceiptIndianRupee)} />
      <Tabs.Screen name="more" options={tab('More', Menu)} />
    </Tabs>
  );
}
