// Every section the role may open that is not already a tab, then the account (docs/23 §4.3).
import { router, type Href } from 'expo-router';
import { Bell, ChartColumn, FileSpreadsheet, FlaskConical, HandCoins, LogOut, PenLine, PiggyBank, ReceiptIndianRupee, Search, Settings, UserPlus, UserRound, Users, type LucideIcon } from 'lucide-react-native';
import type { Permission } from '@tgs/types';
import { Row, TABS_BY_ROLE, useCan } from '@/components/staff';
import { useAuth } from '@/lib/auth';
import { Card, Screen, Skeleton, Text } from '@/ui';

const SECTIONS: Array<{ tab?: string; icon: LucideIcon; label: string; href: Href; permission: Permission }> = [
  { tab: 'joining', icon: UserPlus, label: 'Joining', href: '/staff/joining', permission: 'membership.view' },
  { tab: 'members', icon: Users, label: 'Members', href: '/staff/members', permission: 'members.view' },
  { icon: PenLine, label: 'Change requests', href: '/staff/change-requests', permission: 'members.view' },
  { tab: 'loans', icon: HandCoins, label: 'Loans', href: '/staff/loans', permission: 'loans.view' },
  { tab: 'deposits', icon: PiggyBank, label: 'Deposits', href: '/staff/deposits', permission: 'deposits.view' },
  { tab: 'demand', icon: FileSpreadsheet, label: 'Demand sheets', href: '/staff/demand', permission: 'collections.view' },
  { tab: 'payments', icon: ReceiptIndianRupee, label: 'Payments', href: '/staff/payments', permission: 'collections.view' },
  { tab: 'reports', icon: ChartColumn, label: 'Reports', href: '/staff/reports', permission: 'reports.view' },
  { icon: Settings, label: 'Settings', href: '/staff/settings', permission: 'settings.view' },
];

export default function More() {
  const { me, session, logout } = useAuth();
  const can = useCan();
  const tabs = (session && TABS_BY_ROLE[session.user.role]) || [];
  const sections = SECTIONS.filter((s) => !(s.tab && tabs.includes(s.tab)) && can(s.permission));
  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };
  return (
    <Screen>
      <Text role="pageTitle">More</Text>
      {!me ? (
        <Skeleton height={220} radius={16} />
      ) : sections.length ? (
        <Card padded={false}>
          {sections.map((s, i) => (
            <Row key={s.label} icon={s.icon} label={s.label} divider={i > 0} onPress={() => router.push(s.href)} />
          ))}
        </Card>
      ) : null}
      <Card padded={false}>
        <Row icon={Search} label="Search" onPress={() => router.push('/staff/search')} />
        <Row icon={Bell} label="Notifications" divider onPress={() => router.push('/staff/account/notifications')} />
        <Row icon={UserRound} label="My account" divider onPress={() => router.push('/staff/account')} />
      </Card>
      <Card padded={false}>
        <Row icon={FlaskConical} label="Demo settings" onPress={() => router.push('/demo-settings')} />
        <Row icon={LogOut} label="Sign out" danger divider onPress={() => void signOut()} />
      </Card>
    </Screen>
  );
}
