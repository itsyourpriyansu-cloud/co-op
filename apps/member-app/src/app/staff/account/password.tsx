// ST-04m Change password.
import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ActionAlert, PasswordForm, useAction } from '@/components/staff';
import { Alert, Button, Header, Screen } from '@/ui';

export default function ChangePassword() {
  const { session } = useAuth();
  const a = useAction();
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);
  return (
    <Screen header={<Header title="Change password" onBack={() => router.back()} />}>
      {done ? (
        <>
          <Alert type="success" heading="Password changed" description="Use the new password next time you sign in." />
          <Button text="Done" size="lg" fullWidth onPress={() => router.back()} />
        </>
      ) : (
        <>
          <PasswordForm currentLabel="Current password" currentValue={current} onCurrent={setCurrent} {...(session?.user.id ? { employeeId: session.user.id } : {})} busy={a.busy} fields={a.fields} submitText="Change password" onSave={(next) => void a.run(() => api.auth.changeStaffPassword(current, next), () => setDone(true))} />
          {Object.keys(a.fields).length ? null : <ActionAlert action={a} />}
        </>
      )}
    </Screen>
  );
}
