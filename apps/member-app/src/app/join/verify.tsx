// MJ-02 (step 2): verify the mobile with OTP; this creates the applicant's sign-in (D-067).
// The demo code is shown when the server returns it.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MessageSquareText } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Header, Hero, OtpInput, Screen, Text } from '@/ui';
import { space } from '@/theme';

export default function JoinVerify() {
  const params = useLocalSearchParams<{ otpRef: string; mobile: string; fullName: string; demoOtp?: string }>();
  const { verifyOtp } = useAuth();
  const [otpRef, setOtpRef] = useState(params.otpRef);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const verify = async (code = otp) => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(undefined);
    try {
      await verifyOtp(otpRef, code, params.fullName);
      router.replace('/eligibility');
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Verification failed.');
      setOtp('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    const next = await api.auth.otpStart(params.mobile, 'SIGNUP');
    setOtpRef(next.otpRef);
    setResendIn(30);
    setError(undefined);
  };

  return (
    <Screen header={<Header onBack={() => router.back()} />} footer={<Button text="Verify" size="lg" fullWidth loading={busy} disabled={otp.length !== 6} onPress={() => void verify()} />}>
      <Hero icon={MessageSquareText} title="Enter the code" subtitle={`We sent a 6-digit code to +91 ${params.mobile?.slice(0, 5)} ${params.mobile?.slice(5)}.`} />
      <OtpInput
        value={otp}
        error={error}
        onChange={(v) => {
          setOtp(v);
          if (v.length === 6) void verify(v);
        }}
      />
      {params.demoOtp ? <Alert type="neutral" heading={`Demo code: ${params.demoOtp}`} description="This prototype doesn't send WhatsApp messages." /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <Text role="caption" tone="tertiary">
          Didn't get it?
        </Text>
        {resendIn > 0 ? (
          <Text role="captionStrong" tone="tertiary">
            Resend in {resendIn}s
          </Text>
        ) : (
          <Button text="Resend code" subType="inline" onPress={() => void resend()} />
        )}
      </View>
    </Screen>
  );
}
