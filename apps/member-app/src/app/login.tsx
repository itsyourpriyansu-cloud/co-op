// MA-01 Member sign-in: the mobile registered with the society → a one-time code (D-067). There is no
// password, so activation (MA-02), forgot password (MA-03) and change password (MB-17) are retired.
// The demo panel signs a fictional member in with one tap, as on the console.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, MessageSquareText, Send, UserPlus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import type { OtpStarted, Persona } from '@tgs/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AppMark } from '@/components/AppMark';
import { Banner, Button, Card, Header, PageHeader, OtpInput, Screen, Section, Skeleton, Text, TextField, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

const RESEND_SECONDS = 30;

export default function Login() {
  const { loginAsPersona, verifyOtp } = useAuth();
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState<OtpStarted | null>(null);
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ heading: string; description: string; join?: boolean }>();
  const [pending, setPending] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const personas = useQuery({ queryKey: ['personas', 'app'], queryFn: () => api.demo.personas('app'), retry: false });
  const members = personas.data?.filter((p) => p.role === 'MEMBER') ?? [];

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const failed = (e: unknown) => {
    if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
    if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
    const notRegistered = isApiError(e) && e.fieldErrors?.mobile?.startsWith('Not registered');
    if (notRegistered) setNotice({ heading: 'Mobile not registered', description: 'Use the number in your society record, or apply to become a member.', join: true });
    else if (!(isApiError(e) && e.fieldErrors)) setNotice({ heading: "Couldn't sign in", description: isApiError(e) ? e.message : 'Try again.' });
  };

  const sendCode = async () => {
    setPending('send');
    setErrors({});
    setNotice(undefined);
    try {
      setSent(await api.auth.otpStart(mobile, 'LOGIN'));
      setOtp('');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      failed(e);
    } finally {
      setPending(null);
    }
  };

  const verify = async (code = otp) => {
    if (!sent || code.length !== 6) return;
    setPending('verify');
    setErrors({});
    setNotice(undefined);
    try {
      const session = await verifyOtp(sent.otpRef, code);
      router.replace(session.user.role === 'APPLICANT' ? '/tracker' : '/home');
    } catch (e) {
      setOtp('');
      failed(e);
    } finally {
      setPending(null);
    }
  };

  const quick = async (p: Persona) => {
    setPending(p.id);
    setNotice(undefined);
    try {
      await loginAsPersona(p.id);
      router.replace('/home');
    } catch (e) {
      failed(e);
    } finally {
      setPending(null);
    }
  };

  if (sent) {
    return (
      <Screen
        header={<Header onBack={() => setSent(null)} />}
        footer={<Button label="Verify and sign in" size="lg" fullWidth loading={pending === 'verify'} disabled={otp.length !== 6 || pending !== null} onPress={() => void verify()} />}
      >
        <PageHeader icon={MessageSquareText} title="Enter the code" subtitle={`We sent a 6-digit code to +91 ${sent.mobileMasked}. It works for ${Math.round(sent.expiresInSeconds / 60)} minutes.`} />
        <OtpInput
          value={otp}
          error={errors.otp}
          onChange={(v) => {
            setOtp(v);
            if (v.length === 6) void verify(v);
          }}
        />
        {sent.demoOtp ? <Banner status="neutral" heading={`Demo code: ${sent.demoOtp}`} description="This prototype doesn't send WhatsApp messages." /> : null}
        {notice ? <Banner status="error" heading={notice.heading} description={notice.description} /> : null}
        <View style={styles.resend}>
          <Text type="supporting" tone="secondary">
            Didn't get it?
          </Text>
          {resendIn > 0 ? (
            <Text type="supporting" weight="medium" tone="secondary">
              Resend in {resendIn}s
            </Text>
          ) : (
            <Link label="Resend code" onPress={() => void sendCode()} />
          )}
          <View style={{ flex: 1 }} />
          <Link label="Change number" onPress={() => setSent(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <AppMark size={56} intro />
      <PageHeader title="Sign in" subtitle="Use the mobile number registered with the society. We'll send you a one-time code." />

      <View style={{ gap: spacing[4] }}>
        <TextField
          label="Mobile number"
          value={mobile}
          onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad"
          autoComplete="tel"
          prefix="+91"
          placeholder="10-digit mobile"
          error={errors.mobile}
          onSubmitEditing={() => void sendCode()}
          returnKeyType="send"
        />
        {notice ? <Banner status={notice.join ? 'warning' : 'error'} heading={notice.heading} description={notice.description} action={notice.join ? { text: 'Become a member', onPress: () => router.push('/join') } : undefined} /> : null}
        <Button label="Send code" icon={Send} size="lg" fullWidth loading={pending === 'send'} disabled={mobile.length !== 10 || pending !== null} onPress={() => void sendCode()} />
      </View>

      <Card onPress={() => router.push('/join')}>
        <View style={styles.row}>
          <View style={styles.icon}>
            <UserPlus size={20} color={color.accent} />
          </View>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <Text type="h4">Not a member yet?</Text>
            <Text type="supporting" tone="secondary">
              Apply to join the society from your phone.
            </Text>
          </View>
          <ChevronRight size={20} color={color.text.secondary} />
        </View>
      </Card>

      <Section title="Demo members" description="Fictional people. Tap one to sign in.">
        {personas.isLoading ? (
          <View style={{ gap: spacing[3] }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={68} radius={radius.container} />
            ))}
          </View>
        ) : null}
        {personas.isError ? <Banner status="error" heading="Can't reach the society server" action={{ text: 'Check connection', onPress: () => router.push('/offline') }} /> : null}
        <View style={{ gap: spacing[2] }}>
          {members.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" disabled={pending !== null} onPress={() => void quick(p)} style={({ pressed }) => [styles.persona, pressed && { backgroundColor: color.accentMuted, borderColor: color.accent }]}>
              <View style={styles.avatar}>
                <Text type="label" tone="link">
                  {p.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
                </Text>
              </View>
              <View style={{ flex: 1, gap: spacing[0.5] }}>
                <Text type="label">
                  {p.name} · {p.id.replace(/^mem-/, '')}
                </Text>
                <Text type="supporting" tone="secondary">
                  {p.story}
                </Text>
              </View>
              {pending === p.id ? <ActivityIndicator color={color.accent} /> : <ChevronRight size={20} color={color.text.secondary} />}
            </Pressable>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resend: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], minHeight: 68, borderRadius: radius.container, borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accentMuted, alignItems: 'center', justifyContent: 'center' },
});
