import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, UserPlus, UserRound, type LucideIcon } from 'lucide-react-native';
import { Logo } from '@/components/Logo';
import { AppText, Screen } from '@/components/ui';
import { c, radius, space } from '@/theme';

/** MJ-01 Welcome: two clear paths (docs/06 v0.3). Long-press the logo for Demo settings (MA-05). */
export default function Welcome() {
  return (
    <Screen style={styles.page}>
      <View style={styles.hero}>
        <Pressable
          onLongPress={() => router.push('/demo-settings')}
          accessibilityHint="Long-press for demo settings"
        >
          <Logo size={72} />
        </Pressable>
        <AppText variant="title" style={styles.center}>
          Welcome
        </AppText>
        <AppText variant="muted" style={styles.center}>
          The Telangana Secretariat Employees Co-operative Credit Society Ltd.{'\n'}Regd. No. P-929
        </AppText>
      </View>

      <Choice
        icon={UserRound}
        title="I'm a member"
        body="Sign in to see your loans, deposits and payments."
        onPress={() => router.push({ pathname: '/login', params: { mode: 'member' } })}
      />
      <Choice
        icon={UserPlus}
        title="Become a member"
        body="Apply to join the society and track your application."
        onPress={() => router.push({ pathname: '/login', params: { mode: 'applicant' } })}
      />

      <AppText variant="caption" style={[styles.center, styles.footer]}>
        2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad
      </AppText>
    </Screen>
  );
}

function Choice({
  icon: Icon,
  title,
  body,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        pressed && { borderColor: c.primary, backgroundColor: c.primarySubtle },
      ]}
    >
      <View style={styles.choiceIcon}>
        <Icon size={24} color={c.primary} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="muted">{body}</AppText>
      </View>
      <ChevronRight size={20} color={c.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: space[3], marginBottom: space[4] },
  center: { textAlign: 'center' },
  footer: { marginTop: space[6] },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    padding: space[4],
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
