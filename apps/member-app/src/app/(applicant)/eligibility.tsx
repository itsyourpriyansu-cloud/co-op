// MJ-03 Eligibility check (BR-026): three questions before the form, so nobody fills 7 steps for nothing.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { CircleCheck, CircleX, ListChecks, Phone } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useJoiningReference } from '@/lib/joining';
import { Alert, Button, Card, EmptyState, Header, Hero, Screen, Text, YesNo } from '@/ui';
import { color, space } from '@/theme';

type Answers = { worksInSecretariatDept?: boolean; regularOrApprovedProbationer?: boolean; memberOfOtherCreditSocietyWithDues?: boolean };

export default function Eligibility() {
  const { logout } = useAuth();
  const ref = useJoiningReference();
  const [a, setA] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ eligible: boolean; checks: Array<{ pass: boolean; message: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const complete = a.worksInSecretariatDept !== undefined && a.regularOrApprovedProbationer !== undefined && a.memberOfOtherCreditSocietyWithDues !== undefined;

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.membership.eligibility({
        worksInSecretariatDept: !!a.worksInSecretariatDept,
        regularOrApprovedProbationer: !!a.regularOrApprovedProbationer,
        memberOfOtherCreditSocietyWithDues: !!a.memberOfOtherCreditSocietyWithDues,
      });
      if (r.eligible) router.replace('/apply');
      else setResult(r);
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setError(isApiError(e) ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (result && !result.eligible) {
    return (
      <Screen header={<Header onBack={() => setResult(null)} />} footer={<Button text="Change my answers" buttonType="secondary" size="lg" fullWidth onPress={() => setResult(null)} />}>
        <EmptyState icon={CircleX} tone="warning" title="You can't apply just yet" description="Membership is open to regular employees of Telangana Secretariat departments who are not members of another credit society." />
        <Card>
          <View style={{ gap: space[6] }}>
            {result.checks.map((c) => (
              <View key={c.message} style={{ flexDirection: 'row', gap: space[4], alignItems: 'flex-start' }}>
                {c.pass ? <CircleCheck size={18} color={color.status.success.fg} /> : <CircleX size={18} color={color.status.danger.fg} />}
                <Text role="body" style={{ flex: 1 }}>
                  {c.message}
                </Text>
              </View>
            ))}
          </View>
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'center' }}>
            <Phone size={20} color={color.brand.solid} />
            <View style={{ flex: 1 }}>
              <Text role="bodyStrong">Questions? Contact the society office</Text>
              <Text role="caption" tone="secondary">
                {ref.data?.society.address ?? '2nd Floor, West Ancillary Building, Telangana Secretariat'}
              </Text>
            </View>
          </View>
        </Card>
        <Button text="Sign out" subType="inline" onPress={() => void logout().then(() => router.replace('/welcome'))} />
      </Screen>
    );
  }

  return (
    <Screen header={<Header onBack={() => void logout().then(() => router.replace('/welcome'))} />} footer={<Button text="Check eligibility" size="lg" fullWidth loading={busy} disabled={!complete} onPress={() => void check()} />}>
      <Hero icon={ListChecks} title="Can you join?" subtitle="Three quick questions. It takes 20 seconds." />
      <View style={{ gap: space[6] }}>
        <YesNo question="Do you work in a Telangana Secretariat department?" why="The society is for Secretariat employees only." value={a.worksInSecretariatDept} onChange={(v) => setA({ ...a, worksInSecretariatDept: v })} />
        <YesNo question="Are you a regular employee or an approved probationer?" why="Your department officer confirms this later." value={a.regularOrApprovedProbationer} onChange={(v) => setA({ ...a, regularOrApprovedProbationer: v })} />
        <YesNo question="Are you a member of another credit society with dues?" why="Bye-laws allow membership of only one credit society." value={a.memberOfOtherCreditSocietyWithDues} onChange={(v) => setA({ ...a, memberOfOtherCreditSocietyWithDues: v })} />
      </View>
      {error ? <Alert type="error" heading="Couldn't check" description={error} /> : null}
    </Screen>
  );
}
