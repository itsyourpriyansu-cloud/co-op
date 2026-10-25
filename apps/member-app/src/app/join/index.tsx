// MJ-02 Applicant sign-up: name + mobile → OTP. Keep it short: only what's needed (docs/12 §2.2).
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Header, Hero, Screen, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function JoinSignUp() {
  const { loginAsPersona } = useAuth();
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const otp = await api.joining.signup(fullName.trim(), mobile);
      router.push({ pathname: '/join/verify', params: { otpRef: otp.otpRef, mobile, fullName: fullName.trim(), demoOtp: otp.demoOtp ?? '' } });
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e)) {
        setErrors(e.fieldErrors ?? {});
        setFormError(e.fieldErrors ? null : e.message);
        if (e.code === 'ALREADY_EXISTS') setFormError(e.message);
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
      footer={<Button text="Send OTP" size="lg" fullWidth loading={busy} disabled={fullName.trim().length < 3 || mobile.length !== 10} onPress={submit} />}
    >
      <Hero icon={UserPlus} title="Become a member" subtitle="Start with your name and mobile number. We'll send a one-time password to verify it." />

      <View style={{ gap: space[10] }}>
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

      {formError ? <Alert type="error" heading="Can't continue" description={formError} action={formError.includes('member') ? { text: 'Sign in instead', onPress: () => router.replace('/login') } : undefined} /> : null}

      <View style={{ gap: space[4] }}>
        <Text role="overline" tone="tertiary">
          Demo shortcuts
        </Text>
        <Button text="Continue as Divya S (new applicant)" buttonType="secondary" size="sm" onPress={() => void demoAs('apl-divya')} />
        <Button text="Continue as Ravi Teja K (application in progress)" buttonType="secondary" size="sm" onPress={() => void demoAs('apl-ravi')} />
      </View>
    </Screen>
  );
}
