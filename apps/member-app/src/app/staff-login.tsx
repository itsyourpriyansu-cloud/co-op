// AU-01m / AU-03m Staff sign-in: user ID + password, then an authenticator code for the Super Admin,
// Secretary and President (set up the first time), and a new password after a temporary one (docs/23 §4.4).
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, KeyRound, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import { ROLE_LABELS, type Persona, type Session, type TotpSetup } from '@tgs/types';
import { api } from '@/lib/api';
import { markStaffActive } from '@/lib/appLock';
import { useAuth } from '@/lib/auth';
import * as storage from '@/lib/storage';
import { AppMark } from '@/components/AppMark';
import { MUST_CHANGE_KEY, PasswordForm } from '@/components/staff';
import { Alert, Button, Card, Header, Hero, OtpInput, Screen, Section, Skeleton, Tag, Text, TextField } from '@/ui';
import { color, radius, space } from '@/theme';


type Step = { kind: 'password' } | { kind: 'totp'; challengeToken: string; mustChange: boolean } | { kind: 'setup'; challengeToken: string; mustChange: boolean; setup: TotpSetup } | { kind: 'change' };

export default function StaffLogin() {
  const params = useLocalSearchParams<{ change?: string }>();
  const { session, loginAsPersona, adoptSession, logout } = useAuth();
  const [step, setStep] = useState<Step>(params.change ? { kind: 'change' } : { kind: 'password' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const personas = useQuery({ queryKey: ['personas', 'console'], queryFn: () => api.demo.personas('console'), retry: false });

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setError(undefined);
    setFields({});
    try {
      await work();
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') router.push('/offline');
      else {
        setError(isApiError(e) ? e.message : 'Sign-in failed. Try again.');
        setFields(isApiError(e) ? (e.fieldErrors ?? {}) : {});
      }
    } finally {
      setBusy(null);
    }
  };

  const finish = async (next: Session, mustChange: boolean) => {
    if (mustChange) await storage.setItem(MUST_CHANGE_KEY, '1');
    markStaffActive();
    await adoptSession(next);
    setCode('');
    if (mustChange) setStep({ kind: 'change' });
    else router.replace('/staff/home');
  };

  const signIn = () =>
    void run('password', async () => {
      const r = await api.auth.staffLogin(username.trim(), password);
      if (r.status === 'TOTP_REQUIRED') setStep({ kind: 'totp', challengeToken: r.challengeToken, mustChange: r.mustChangePassword });
      else if (r.status === 'TOTP_SETUP_REQUIRED') setStep({ kind: 'setup', challengeToken: r.challengeToken, mustChange: r.mustChangePassword, setup: await api.auth.totpSetup(r.challengeToken) });
      else await finish(r.session, r.mustChangePassword);
    });

  const submitCode = (value = code) => {
    if ((step.kind !== 'totp' && step.kind !== 'setup') || value.length !== 6) return;
    void run('code', async () => {
      try {
        const next = step.kind === 'totp' ? await api.auth.totpVerify(step.challengeToken, value) : await api.auth.totpConfirm(step.challengeToken, value);
        await finish(next, step.mustChange);
      } catch (e) {
        setCode('');
        throw e;
      }
    });
  };

  const restart = () => {
    setStep({ kind: 'password' });
    setCode('');
    setError(undefined);
    setFields({});
  };

  const quick = (p: Persona) =>
    void run(p.id, async () => {
      markStaffActive();
      await loginAsPersona(p.id, 'console');
      router.replace('/staff/home');
    });

  const issue = error ? <Alert type="error" heading="Couldn't sign in" description={error} /> : null;

  if (step.kind === 'totp' || step.kind === 'setup') {
    const isSetup = step.kind === 'setup';
    return (
      <Screen header={<Header onBack={restart} />} footer={<Button text={isSetup ? 'Confirm and sign in' : 'Verify and sign in'} size="lg" fullWidth loading={busy === 'code'} disabled={code.length !== 6 || busy !== null} onPress={() => submitCode()} />}>
        <Hero icon={ShieldCheck} title={isSetup ? 'Set up an authenticator app' : 'Enter your authenticator code'} subtitle={isSetup ? 'Your role signs approvals, so the society asks for a second step. Use Google Authenticator, Microsoft Authenticator or any TOTP app.' : 'Open the authenticator app and type the 6-digit code shown for TGSECCSL.'} />
        {step.kind === 'setup' ? (
          <Card>
            <View style={{ gap: space[6] }}>
              <Button text="Add to the authenticator on this phone" leftSlot={Smartphone} buttonType="secondary" fullWidth onPress={() => void Linking.openURL(step.setup.otpauthUrl)} />
              <View style={{ alignItems: 'center' }}>
                <Image source={{ uri: step.setup.qrDataUrl }} style={styles.qr} accessibilityLabel="QR code to add TGSECCSL to an authenticator app on another device" />
              </View>
              <View style={{ gap: space[2] }}>
                <Text role="caption" tone="secondary">
                  Can't scan? Type this key instead:
                </Text>
                <Text role="bodyStrong" selectable>
                  {step.setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}
        <OtpInput
          value={code}
          error={fields.code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) submitCode(v);
          }}
        />
        {error && !fields.code ? <Alert type="error" heading="That didn't work" description={error} /> : null}
      </Screen>
    );
  }

  if (step.kind === 'change') {
    return (
      <Screen
        header={
          <Header
            onBack={() =>
              void (async () => {
                await storage.removeItem(MUST_CHANGE_KEY);
                await logout();
                router.replace('/welcome');
              })()
            }
          />
        }
      >
        <Hero icon={KeyRound} title="Choose a new password" subtitle="You signed in with a temporary password. Choose your own before you continue." />
        <PasswordForm
          currentLabel="Temporary password"
          currentValue={password}
          onCurrent={setPassword}
          {...(session?.user.id ? { employeeId: session.user.id } : {})}
          busy={busy === 'change'}
          fields={fields}
          submitText="Save and continue"
          onSave={(next) =>
            void run('change', async () => {
              await api.auth.changeStaffPassword(password, next);
              await storage.removeItem(MUST_CHANGE_KEY);
              router.replace('/staff/home');
            })
          }
        />
        {error && !Object.keys(fields).length ? <Alert type="error" heading="That didn't work" description={error} /> : null}
      </Screen>
    );
  }

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <AppMark size={56} />
      <Hero title="Staff sign-in" subtitle="Use the user ID and password the Super Admin gave you." />
      <View style={{ gap: space[8] }}>
        <TextField label="User ID" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" error={fields.username} />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" error={fields.password} onSubmitEditing={signIn} returnKeyType="go" />
        {issue}
        <Button text="Sign in" size="lg" fullWidth loading={busy === 'password'} disabled={!username.trim() || !password || busy !== null} onPress={signIn} />
        <Text role="caption" tone="tertiary" style={{ textAlign: 'center' }}>
          Forgot your password? The Super Admin can give you a temporary one.
        </Text>
      </View>

      {personas.isLoading ? <Skeleton height={68} radius={radius.card} /> : null}
      {personas.data?.length ? (
        <Section title="Demo sign-in" description="Fictional data only. Not available on the live server.">
          <View style={{ gap: space[4] }}>
            {personas.data.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" disabled={busy !== null} onPress={() => quick(p)} style={({ pressed }) => [styles.persona, pressed && { backgroundColor: color.brand.subtle, borderColor: color.brand.solid }]}>
                <View style={styles.avatar}>
                  <Text role="label" tone="link">
                    {p.name
                      .split(' ')
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join('')}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="label">{p.name}</Text>
                  <Tag text={ROLE_LABELS[p.role]} color="primary" size="xs" />
                  <Text role="caption" tone="secondary">
                    {p.story}
                  </Text>
                </View>
                {busy === p.id ? <ActivityIndicator color={color.brand.solid} /> : <ChevronRight size={20} color={color.text.tertiary} />}
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { width: 176, height: 176, backgroundColor: '#FFFFFF' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: space[6], padding: space[6], minHeight: 68, borderRadius: radius.card, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
});
