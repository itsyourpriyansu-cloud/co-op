// MJ-01 Welcome: two clear paths (D-026). Long-press the logo for Demo settings (MA-05).
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, FileSignature, ShieldCheck, Smartphone, UserPlus, UserRound } from 'lucide-react-native';
import { brand } from '@tgs/design-tokens';
import { Logo } from '@/components/Logo';
import { Card, Screen, Text } from '@/ui';
import { color, onBrandMuted, radius, space, onBrandTile } from '@/theme';

const HOW = [
  { icon: Smartphone, title: 'Apply from your phone', body: 'About 8 minutes. Save and finish later.' },
  { icon: FileSignature, title: 'Sign with OTP', body: 'No paper forms, no office visit.' },
  { icon: BadgeCheck, title: 'Track every step', body: 'See when your department and the office act.' },
];

export default function Welcome() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Pressable onLongPress={() => router.push('/demo-settings')} accessibilityHint="Long-press for demo settings" delayLongPress={600}>
          <Logo size={120} />
        </Pressable>
        <View style={{ gap: space[3] }}>
          <Text role="display" style={styles.center}>
            {brand.appName}
          </Text>
          <Text role="body" tone="secondary" style={styles.center}>
            {brand.legalName}
          </Text>
          <Text role="caption" tone="tertiary" style={styles.center}>
            Regd. No. {brand.registrationNo}
          </Text>
        </View>
      </View>

      <View style={{ gap: space[6] }}>
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
        <Text role="overline" tone="tertiary">
          How joining works
        </Text>
        <View style={{ gap: space[8], marginTop: space[6] }}>
          {HOW.map((h) => (
            <View key={h.title} style={styles.how}>
              <View style={styles.howIcon}>
                <h.icon size={20} color={color.brand.solid} strokeWidth={1.75} />
              </View>
              <View style={{ flex: 1 }}>
                <Text role="bodyStrong">{h.title}</Text>
                <Text role="caption" tone="secondary">
                  {h.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.trust}>
        <ShieldCheck size={16} color={color.text.tertiary} />
        <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
          Demo build with fictional data. Your details stay on the society server.
        </Text>
      </View>
    </Screen>
  );
}

function Path({ icon: Icon, title, body, primary, onPress }: { icon: typeof UserPlus; title: string; body: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.path, primary && styles.pathPrimary, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.pathIcon, primary && { backgroundColor: onBrandTile }]}>
        <Icon size={24} color={primary ? color.text.onBrand : color.brand.solid} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="cardTitle" tone={primary ? 'onBrand' : 'primary'}>
          {title}
        </Text>
        <Text role="caption" style={{ color: primary ? onBrandMuted : color.text.secondary }}>
          {body}
        </Text>
      </View>
      <ChevronRight size={22} color={primary ? color.text.onBrand : color.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space[8], paddingTop: space[12] },
  center: { textAlign: 'center' },
  path: { flexDirection: 'row', alignItems: 'center', gap: space[6], padding: space[8], minHeight: 88, borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  pathPrimary: { backgroundColor: color.brand.solid, borderColor: color.brand.solid },
  pathIcon: { width: 48, height: 48, borderRadius: radius.control, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
  how: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  howIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', gap: space[4], alignItems: 'center', justifyContent: 'center' },
});
