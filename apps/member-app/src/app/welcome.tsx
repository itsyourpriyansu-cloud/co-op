// MJ-01 Welcome: two clear paths (D-026). Long-press the app mark for Demo settings (MA-05).
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, FileSignature, ShieldCheck, Smartphone, UserPlus, UserRound } from 'lucide-react-native';
import { brand } from '@tgs/design-tokens';
import { AppMark } from '@/components/AppMark';
import { Card, Screen, Text, Link, haptic, usePressScale } from '@/ui';
import { color, radius, shadow, spacing } from '@/theme';
import { DEMO_TOOLS } from '@/lib/serverUrl';

const HOW = [
  { icon: Smartphone, title: 'Apply from your phone', body: 'About 8 minutes. Save and finish later.' },
  { icon: FileSignature, title: 'Sign with OTP', body: 'No paper forms, no office visit.' },
  { icon: BadgeCheck, title: 'Track every step', body: 'See when your department and the office act.' },
];

export default function Welcome() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Pressable disabled={!DEMO_TOOLS} onLongPress={() => router.push('/demo-settings')} {...(DEMO_TOOLS ? { accessibilityHint: 'Long-press for demo settings' } : {})} delayLongPress={600}>
          <AppMark size={72} intro />
        </Pressable>
        <View style={{ gap: spacing[1.5] }}>
          <Text type="display-2" style={styles.center}>
            {brand.appName}
          </Text>
          <Text type="body" tone="secondary" style={styles.center}>
            {brand.legalName}
          </Text>
          <Text type="supporting" tone="secondary" style={styles.center}>
            Regd. No. {brand.registrationNo}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing[3] }}>
        <Path
          icon={UserPlus}
          title="Become a member"
          body="Secretariat employee? Apply to join and track your application."
          primary
          onPress={() => router.push('/join')}
        />
        <Path icon={UserRound} title="I'm already a member" body="Sign in to see your loans, deposits and payments." onPress={() => router.push('/login')} />
      </View>

      <Card>
        <Text type="overline" tone="secondary">
          How joining works
        </Text>
        <View style={{ gap: spacing[4], marginTop: spacing[3] }}>
          {HOW.map((h) => (
            <View key={h.title} style={styles.how}>
              <View style={styles.howIcon}>
                <h.icon size={20} color={color.accent} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text type="body" weight="medium">{h.title}</Text>
                <Text type="supporting" tone="secondary">
                  {h.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Link label="Society staff? Sign in" style={{ alignSelf: 'center' }} onPress={() => router.push('/staff-login')} />

      <View style={styles.trust}>
        <ShieldCheck size={16} color={color.text.secondary} />
        <Text type="supporting" tone="secondary" style={{ flex: 1 }}>
          Demo build with fictional data. Your details stay on the society server.
        </Text>
      </View>
    </Screen>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Path({ icon: Icon, title, body, primary, onPress }: { icon: typeof UserPlus; title: string; body: string; primary?: boolean; onPress: () => void }) {
  const { scaleStyle, pressHandlers } = usePressScale(0.98);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        if (primary) haptic.tap();
        onPress();
      }}
      {...pressHandlers}
      style={[styles.path, primary && styles.pathPrimary, scaleStyle]}
    >
      <View style={[styles.pathIcon, primary && { backgroundColor: color.accentTile }]}>
        <Icon size={24} color={primary ? color.text.onAccent : color.accent} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <Text type="h4" tone={primary ? 'onAccent' : 'primary'}>
          {title}
        </Text>
        <Text type="supporting" style={{ color: primary ? color.text.onAccentMuted : color.text.secondary }}>
          {body}
        </Text>
      </View>
      <ChevronRight size={22} color={primary ? color.text.onAccent : color.text.secondary} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing[4], paddingTop: spacing[6] },
  center: { textAlign: 'center' },
  path: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], minHeight: 88, borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface },
  pathPrimary: { backgroundColor: color.accent, borderColor: color.accent, boxShadow: shadow.med },
  pathIcon: { width: 48, height: 48, borderRadius: radius.element, backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
  how: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  howIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', gap: spacing[2], alignItems: 'center', justifyContent: 'center' },
});
