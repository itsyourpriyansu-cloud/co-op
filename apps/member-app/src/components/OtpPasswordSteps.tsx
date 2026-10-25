// Steps 2–3 shared by MA-02 Activate and MA-03 Forgot password: enter the SMS code, then choose a
// password (D-062 meter). The parent owns step 1 (who you are) and what happens after Save.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { isApiError } from '@tgs/api-client';
import type { AccountOtp } from '@tgs/types';
import { api } from '@/lib/api';
import { PasswordField, PasswordStrength } from '@/components/Password';
import { Alert, Button, Card, OtpInput, Text } from '@/ui';
import { space } from '@/theme';

export function OtpStep({ challenge, onVerified, onResend }: { challenge: AccountOtp; onVerified: (passwordToken: string) => void; onResend: () => Promise<void> }) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(30);
  useEffect(() => {
    setLeft(30);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [challenge.otpRef]);

  const verify = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.auth.verifyOtp(challenge.otpRef, otp);
      onVerified(r.passwordToken);
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setError(isApiError(e) ? e.message : 'Could not check the code.');
      setOtp('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space[8] }}>
      <Text role="body" tone="secondary">
        We sent a 6-digit code to {challenge.mobileMasked}. It is valid for {Math.round(challenge.expiresInSeconds / 60)} minutes.
      </Text>
      {challenge.demoOtp ? (
        <Card>
          <Text role="caption" tone="tertiary">
            Demo build: no SMS is sent. The code is {challenge.demoOtp}.
          </Text>
        </Card>
      ) : null}
      <OtpInput value={otp} onChange={setOtp} error={error} />
      <Button text="Verify code" size="lg" fullWidth disabled={otp.length !== 6} loading={busy} onPress={() => void verify()} />
      <Button text={left ? `Resend code in ${left}s` : 'Resend code'} buttonType="secondary" subType="inline" disabled={left > 0} onPress={() => void onResend()} />
    </View>
  );
}

export function NewPasswordStep({ passwordToken, own, saveText, onSaved }: { passwordToken: string; own?: { generalNo?: string; employeeId?: string; mobile?: string }; saveText: string; onSaved: (r: Awaited<ReturnType<typeof api.auth.setPassword>>) => void | Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== password;

  const save = async () => {
    if (confirm !== password) return setErrors({ confirm: 'The two passwords are not the same.' });
    setBusy(true);
    setErrors({});
    try {
      await onSaved(await api.auth.setPassword(passwordToken, password));
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.fieldErrors?.passwordToken) setErrors({ form: e.message });
      else if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setErrors({ form: isApiError(e) ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space[8] }}>
      <PasswordField label="New password" value={password} onChangeText={setPassword} error={errors.password} required />
      <PasswordStrength password={password} own={own} />
      <PasswordField label="Type it again" value={confirm} onChangeText={setConfirm} error={errors.confirm ?? (mismatch ? 'Not the same yet.' : undefined)} required />
      {errors.form ? <Alert type="error" heading="Not saved" description={errors.form} /> : null}
      <Button text={saveText} size="lg" fullWidth disabled={!password || !confirm} loading={busy} onPress={() => void save()} />
    </View>
  );
}
