// MJ-02 Applicant sign-up: name + mobile → OTP (D-067: the mobile is the sign-in from now on).
// Keep it short: only what's needed (docs/12 §2.2).
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Header, PageHeader, Screen, Text, TextField } from '@/ui';
import { spacing } from '@/theme';

export default function JoinSignUp() {
  const { loginAsPersona } = useAuth();
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; signIn?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const otp = await api.auth.otpStart(mobile, 'SIGNUP');
      router.push({ pathname: '/join/verify', params: { otpRef: otp.otpRef, mobile, fullName: fullName.trim(), demoOtp: otp.demoOtp ?? '' } });
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e)) {
        setErrors(e.fieldErrors ?? {});
        setFormError(e.code === 'ALREADY_EXISTS' ? { message: e.message, signIn: true } : e.fieldErrors ? null : { message: e.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const demoAs = async (personaId: string) => {
    await loginAsPersona(personaId);
    router.replace('/tracker');
  };

  return (
    <Screen
      header={<Header onBack={() => router.back()} />}
      footer={<Button label="Send OTP" size="lg" fullWidth loading={busy} disabled={fullName.trim().length < 3 || mobile.length !== 10} onPress={submit} />}
    >
      <PageHeader icon={UserPlus} title="Become a member" subtitle="Start with your name and mobile number. We'll send a one-time password to verify it." />

      <View style={{ gap: spacing[5] }}>
        <TextField label="Full name" required value={fullName} onChangeText={setFullName} autoCapitalize="words" autoComplete="name" placeholder="As in your service records" error={errors.fullName} />
        <TextField
          label="Mobile number"
          required
          value={mobile}
          onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad"
          autoComplete="tel"
          prefix="+91"
          placeholder="10-digit mobile"
          hint="Use the number registered with your department"
          error={errors.mobile}
        />
      </View>

      {formError ? <Banner status="error" heading="Can't continue" description={formError.message} action={formError.signIn ? { text: 'Sign in instead', onPress: () => router.replace('/login') } : undefined} /> : null}

      <View style={{ gap: spacing[2] }}>
        <Text type="overline" tone="secondary">
          Demo shortcuts
        </Text>
        <Button label="Continue as Divya S (new applicant)" variant="secondary" size="sm" onPress={() => void demoAs('apl-divya')} />
        <Button label="Continue as Ravi Teja K (application in progress)" variant="secondary" size="sm" onPress={() => void demoAs('apl-ravi')} />
      </View>
    </Screen>
  );
}
