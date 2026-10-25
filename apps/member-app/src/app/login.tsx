// MA-01 Member sign-in: General No. or Employee ID + password (J-14, D-062). Links to MA-03 Forgot
// password and MA-02 Activate. The demo panel fills a fictional member's General No. and the demo
// password, so a walkthrough still takes one tap but goes through the real password check.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, LogIn, Sparkles } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import type { Persona } from '@tgs/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEMO_PASSWORD } from '@/lib/demo';
import { Logo } from '@/components/Logo';
import { PasswordField } from '@/components/Password';
import { Alert, Button, Card, Header, Hero, Screen, Section, Skeleton, Text, TextField } from '@/ui';
import { color, radius, space } from '@/theme';

export default function Login() {
  const { signIn } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ heading: string; description: string; activate?: boolean }>();
  const [pending, setPending] = useState<string | null>(null);
  const personas = useQuery({ queryKey: ['personas', 'app'], queryFn: () => api.demo.personas('app'), retry: false });
  const members = personas.data?.filter((p) => p.role === 'MEMBER') ?? [];

  const submit = async (who = login, pass = password, key = 'form') => {
    setPending(key);
    setErrors({});
    setNotice(undefined);
    try {
      await signIn(who, pass);
      router.replace('/home');
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else if (isApiError(e) && e.ruleId === 'NOT_ACTIVATED') setNotice({ heading: 'Activate the app first', description: e.message, activate: true });
      else setNotice({ heading: "Couldn't sign in", description: isApiError(e) ? e.message : 'Try again.' });
    } finally {
      setPending(null);
    }
  };

  const quick = (p: Persona) => {
    const no = p.id.replace(/^mem-/, '');
    setLogin(no);
    setPassword(DEMO_PASSWORD);
    void submit(no, DEMO_PASSWORD, p.id);
  };

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <Logo size={72} />
      <Hero title="Sign in" subtitle="Use your General No. or Employee ID and your app password." />

      <View style={{ gap: space[8] }}>
        <TextField label="General No. or Employee ID" autoCapitalize="characters" autoCorrect={false} value={login} onChangeText={setLogin} error={errors.login} placeholder="e.g. 1101" />
        <PasswordField label="Password" value={password} onChangeText={setPassword} error={errors.password} onSubmitEditing={() => void submit()} returnKeyType="go" />
        <View style={styles.forgot}>
          <Button text="Forgot password?" buttonType="secondary" subType="inline" size="sm" onPress={() => router.push({ pathname: '/forgot-password', params: login ? { login } : {} })} />
        </View>
        {notice ? <Alert type={notice.activate ? 'warning' : 'error'} heading={notice.heading} description={notice.description} action={notice.activate ? { text: 'Activate now', onPress: () => router.push('/activate') } : undefined} /> : null}
        <Button text="Sign in" leftSlot={LogIn} size="lg" fullWidth loading={pending === 'form'} disabled={pending !== null} onPress={() => void submit()} />
      </View>

      <Card onPress={() => router.push('/activate')}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Sparkles size={20} color={color.brand.solid} />
          </View>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="cardTitle">First time here?</Text>
            <Text role="caption" tone="secondary">
              Activate the app with your Employee ID and the mobile registered with the society.
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.tertiary} />
        </View>
      </Card>

      <Section title="Demo members" description={`Fictional people. Tap one to sign in with the demo password ${DEMO_PASSWORD}.`}>
        {personas.isLoading ? (
          <View style={{ gap: space[6] }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius={radius.card} />
            ))}
          </View>
        ) : null}
        {personas.isError ? <Alert type="error" heading="Can't reach the society server" action={{ text: 'Check connection', onPress: () => router.push('/offline') }} /> : null}
        <View style={{ gap: space[4] }}>
          {members.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" disabled={pending !== null} onPress={() => quick(p)} style={({ pressed }) => [styles.persona, pressed && { backgroundColor: color.brand.subtle, borderColor: color.brand.solid }]}>
              <View style={styles.avatar}>
                <Text role="label" tone="link">
                  {p.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                </Text>
              </View>
              <View style={{ flex: 1, gap: space[1] }}>
                <Text role="label">
                  {p.name} · {p.id.replace(/^mem-/, '')}
                </Text>
                <Text role="caption" tone="secondary">
                  {p.story}
                </Text>
              </View>
              {pending === p.id ? <ActivityIndicator color={color.brand.solid} /> : <ChevronRight size={20} color={color.text.tertiary} />}
            </Pressable>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginTop: -space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: space[6], padding: space[6], minHeight: 68, borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
});
