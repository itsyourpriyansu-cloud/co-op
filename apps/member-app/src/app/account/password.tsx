// MB-17 Change password: current + new (D-062 meter) + confirm. Other phones signed in as this member
// are signed out; this one stays signed in.
import { useState } from 'react';
import { router } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PasswordField, PasswordStrength } from '@/components/Password';
import { Alert, Button, EmptyState, Header, Screen, Text } from '@/ui';

export default function ChangePassword() {
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number>();

  const save = async () => {
    if (next !== confirm) return setErrors({ confirm: 'The two new passwords are not the same.' });
    setBusy(true);
    setErrors({});
    try {
      setDone((await api.account.changePassword(current, next)).signedOutOtherSessions);
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setErrors({ form: isApiError(e) ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  if (done !== undefined)
    return (
      <Screen header={<Header title="Change password" onBack={() => router.back()} />} footer={<Button text="Done" size="lg" fullWidth onPress={() => router.back()} />}>
        <EmptyState icon={CircleCheck} tone="success" title="Password changed" description={done ? `Use it next time you sign in. ${done} other ${done === 1 ? 'phone was' : 'phones were'} signed out.` : 'Use it next time you sign in.'} />
      </Screen>
    );

  return (
    <Screen header={<Header title="Change password" onBack={() => router.back()} />} footer={<Button text="Save new password" size="lg" fullWidth disabled={!current || !next || !confirm} loading={busy} onPress={() => void save()} />}>
      <Text role="body" tone="secondary">
        Other phones signed in as you will be signed out. This one stays signed in.
      </Text>
      <PasswordField label="Current password" value={current} onChangeText={setCurrent} error={errors.current} required />
      <PasswordField label="New password" value={next} onChangeText={setNext} error={errors.password} required />
      <PasswordStrength password={next} {...(session?.user.generalNo ? { own: { generalNo: session.user.generalNo } } : {})} />
      <PasswordField label="Type the new one again" value={confirm} onChangeText={setConfirm} error={errors.confirm ?? (confirm && confirm !== next ? 'Not the same yet.' : undefined)} required />
      {errors.form ? <Alert type="error" heading="Not saved" description={errors.form} /> : null}
      <Button text="Forgot your current password?" buttonType="secondary" subType="inline" size="sm" onPress={() => router.push({ pathname: '/forgot-password', params: session?.user.generalNo ? { login: session.user.generalNo } : {} })} />
    </Screen>
  );
}
