// MA-03 Forgot password: General No. / Employee ID → SMS code to the registered mobile → new password
// → back to sign in. Every device signed in with the old password is signed out (D-062).
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { AccountOtp } from '@tgs/types';
import { api } from '@/lib/api';
import { NewPasswordStep, OtpStep } from '@/components/OtpPasswordSteps';
import { Alert, Button, EmptyState, Header, Hero, Screen, TextField, WizardProgress } from '@/ui';
import { space } from '@/theme';

const TITLES = ['Find your account', 'Enter the code', 'New password'] as const;

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ login?: string }>();
  const [login, setLogin] = useState(params.login ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ heading: string; description: string; activate?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<AccountOtp>();
  const [passwordToken, setPasswordToken] = useState<string>();
  const [done, setDone] = useState(false);
  const step = passwordToken ? 3 : challenge ? 2 : 1;

  const start = async () => {
    setBusy(true);
    setErrors({});
    setNotice(undefined);
    try {
      setChallenge(await api.auth.startReset(login.trim()));
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.ruleId === 'NOT_ACTIVATED') setNotice({ heading: 'Not activated yet', description: e.message, activate: true });
      else if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setNotice({ heading: "Couldn't continue", description: isApiError(e) ? e.message : 'Try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Screen header={<Header title="Forgot password" />} footer={<Button text="Sign in" size="lg" fullWidth onPress={() => router.replace({ pathname: '/login' })} />}>
        <EmptyState icon={CircleCheck} tone="success" title="Password changed" description="Sign in with your new password. Any phone that was signed in with the old one has been signed out." />
      </Screen>
    );

  return (
    <Screen header={<Header title="Forgot password" onBack={passwordToken ? undefined : () => (challenge ? setChallenge(undefined) : router.back())} />}>
      <WizardProgress step={step} total={3} title={TITLES[step - 1]!} />
      <Hero title={TITLES[step - 1]!} subtitle={step === 1 ? 'We send a code to the mobile registered with the society.' : undefined} />
      {step === 1 ? (
        <View style={{ gap: space[8] }}>
          <TextField label="General No. or Employee ID" autoCapitalize="characters" autoCorrect={false} value={login} onChangeText={setLogin} error={errors.login} required />
          {notice ? <Alert type={notice.activate ? 'warning' : 'error'} heading={notice.heading} description={notice.description} action={notice.activate ? { text: 'Activate the app', onPress: () => router.replace('/activate') } : undefined} /> : null}
          <Button text="Send code" size="lg" fullWidth disabled={!login.trim()} loading={busy} onPress={() => void start()} />
        </View>
      ) : null}
      {step === 2 && challenge ? <OtpStep challenge={challenge} onVerified={setPasswordToken} onResend={start} /> : null}
      {step === 3 && passwordToken ? <NewPasswordStep passwordToken={passwordToken} own={/^\d+$/.test(login.trim()) ? { generalNo: login.trim() } : { employeeId: login.trim() }} saveText="Save new password" onSaved={() => setDone(true)} /> : null}
    </Screen>
  );
}
