import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { c, space } from '@/theme';

// The six stages an applicant sees (docs/10 §2). Live status per stage arrives in M3.
const STAGES = [
  'Application received',
  'Department verification',
  'Society office review',
  'Approval (Secretary & President)',
  'Share payment',
  'Welcome: General No. allotted',
];

/** MJ-05 Application stage tracker (shell). */
export default function Tracker() {
  const { session, logout } = useAuth();

  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">Your application</AppText>
        <AppText variant="muted">{session?.user.name}</AppText>
      </View>

      <Card style={{ gap: space[1] }}>
        {STAGES.map((label, i) => (
          <View key={label} style={styles.stage}>
            <View style={styles.rail}>
              <View style={styles.dot}>
                <AppText style={styles.dotText}>{i + 1}</AppText>
              </View>
              {i < STAGES.length - 1 && <View style={styles.line} />}
            </View>
            <AppText style={{ flex: 1, paddingTop: 4 }}>{label}</AppText>
          </View>
        ))}
      </Card>

      <AppText variant="muted">
        The membership form and live stage updates arrive in M3. This shell proves applicant mode
        and routing.
      </AppText>
      <AppButton label="Sign out" icon={LogOut} variant="outline" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: 'row', gap: space[3], minHeight: 52 },
  rail: { alignItems: 'center', width: 32 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  line: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
});
