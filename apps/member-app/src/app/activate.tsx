// MA-02 Activate the app (J-14): an existing member who has never used the app proves who they are
// with Employee ID (or General No.) + the mobile registered in the Member Master → SMS code → choose a
// password → signed in on Home. The demo card fills a seeded member who has not activated yet.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Sparkles } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { AccountOtp } from '@tgs/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NewPasswordStep, OtpStep } from '@/components/OtpPasswordSteps';
import { Alert, Button, Card, Header, Hero, Screen, Text, TextField, WizardProgress } from '@/ui';
import { color, space } from '@/theme';

const TITLES = ['Who you are', 'Enter the code', 'Choose a password'] as const;

export default function Activate() {
  const { adoptSession } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ heading: string; description: string; signIn?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<AccountOtp>();
  const [passwordToken, setPasswordToken] = useState<string>();
  const sample = useQuery({ queryKey: ['activation-sample'], queryFn: api.demo.activationSample, retry: false });
  const step = passwordToken ? 3 : challenge ? 2 : 1;

  const start = async () => {
    setBusy(true);
    setErrors({});
    setNotice(undefined);
    try {
      setChallenge(await api.auth.startActivation(employeeId.trim(), mobile));
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.ruleId === 'ALREADY_ACTIVE') setNotice({ heading: 'Already activated', description: e.message, signIn: true });
      else if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setNotice({ heading: "Couldn't continue", description: isApiError(e) ? e.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const back = () => (passwordToken ? undefined : challenge ? setChallenge(undefined) : router.back());

  return (
    <Screen header={<Header title="Activate the app" onBack={passwordToken ? undefined : back} />}>
      <WizardProgress step={step} total={3} title={TITLES[step - 1]!} />
      <Hero title={TITLES[step - 1]!} subtitle={step === 1 ? 'For members already in the society. We check your details against the Member Master.' : undefined} icon={step === 3 ? ShieldCheck : undefined} />

      {step === 1 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="Employee ID or General No." autoCapitalize="characters" autoCorrect={false} value={employeeId} onChangeText={setEmployeeId} error={errors.employeeId} required />
          <TextField label="Registered mobile" prefix="+91" keyboardType="number-pad" maxLength={10} value={mobile} onChangeText={(t) => setMobile(t.replace(/[^0-9]/g, ''))} error={errors.mobile} hint="The number the society has on record" required />
          {notice ? <Alert type={notice.signIn ? 'primary' : 'error'} heading={notice.heading} description={notice.description} action={notice.signIn ? { text: 'Go to sign in', onPress: () => router.replace('/login') } : undefined} /> : null}
          <Button text="Send code" size="lg" fullWidth disabled={!employeeId.trim() || mobile.length !== 10} loading={busy} onPress={() => void start()} />
          {sample.data ? (
            <Card onPress={() => (setEmployeeId(sample.data.employeeId), setMobile(sample.data.mobile))}>
              <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'center' }}>
                <Sparkles size={20} color={color.brand.solid} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="label">Demo: {sample.data.name}</Text>
                  <Text role="caption" tone="secondary">
                    General No. {sample.data.generalNo} has not activated the app. Tap to fill Employee ID {sample.data.employeeId} and mobile {sample.data.mobile}.
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}
        </View>
      ) : null}

      {step === 2 && challenge ? (
        <>
          <Text role="body">Hello {challenge.name}.</Text>
          <OtpStep challenge={challenge} onVerified={setPasswordToken} onResend={start} />
        </>
      ) : null}

      {step === 3 && passwordToken ? (
        <NewPasswordStep
          passwordToken={passwordToken}
          own={{ employeeId, mobile, ...(sample.data && sample.data.employeeId === employeeId ? { generalNo: sample.data.generalNo } : {}) }}
          saveText="Activate & sign in"
          onSaved={async (r) => {
            if (r.activated) {
              await adoptSession(r.session);
              router.replace('/home');
            }
          }}
        />
      ) : null}
    </Screen>
  );
}
