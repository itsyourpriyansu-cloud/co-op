import { StyleSheet, View } from 'react-native';
import { Calculator, FileText, HandCoins, PiggyBank, type LucideIcon } from 'lucide-react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c, radius, space } from '@/theme';

/** MB-01 Home shell. Snapshot numbers and quick actions go live in M8 (docs/06). */
export default function Home() {
  const { session } = useAuth();
  const firstName = session?.user.name.split(' ')[0] ?? '';

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">Hello, {firstName}</AppText>
        {session?.user.generalNo && (
          <AppText variant="muted">General No. {session.user.generalNo}</AppText>
        )}
      </View>

      <View style={styles.hero}>
        <AppText style={styles.heroTitle}>My Society Snapshot</AppText>
        <AppText style={styles.heroBody}>
          Share capital, deposits and loan dues appear here from M8.
        </AppText>
      </View>

      <View style={styles.grid}>
        <Action icon={HandCoins} label="Apply loan" />
        <Action icon={PiggyBank} label="Open FD" />
        <Action icon={Calculator} label="Calculator" />
        <Action icon={FileText} label="Statement" />
      </View>

      <Card>
        <AppText variant="heading">Foundation build (M0)</AppText>
        <AppText variant="muted">
          Sign-in, navigation and the server connection are live. Screens arrive milestone by
          milestone.
        </AppText>
      </Card>
    </Screen>
  );
}

function Action({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View
      style={styles.action}
      accessible
      accessibilityLabel={`${label}, coming soon`}
      accessibilityState={{ disabled: true }}
    >
      <View style={styles.actionIcon}>
        <Icon size={22} color={c.primary} strokeWidth={1.75} />
      </View>
      <AppText variant="caption" style={{ color: c.text }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: c.primary, borderRadius: radius.lg, padding: space[5], gap: space[2] },
  heroTitle: { color: c.primaryForeground, fontSize: 18, fontWeight: '700' },
  heroBody: { color: c.primaryForeground, opacity: 0.85, fontSize: 14 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { alignItems: 'center', gap: space[2], width: '23%', opacity: 0.6 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
