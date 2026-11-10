// ST-04m My account: who I am, my signature, my password.
import { router } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { ROLE_LABELS } from '@tgs/types';
import { SignatureCard } from '@/components/SignatureCard';
import { Row } from '@/components/staff';
import { useAuth } from '@/lib/auth';
import { Card, Header, KeyValue, Screen, Section } from '@/ui';

export default function Account() {
  const { session } = useAuth();
  if (!session) return null;
  return (
    <Screen header={<Header title="My account" onBack={() => router.back()} />}>
      <Card>
        <KeyValue label="Name" value={session.user.name} />
        <KeyValue label="Role" value={ROLE_LABELS[session.user.role]} />
      </Card>
      <Section title="My signature" description="Printed on what you sign, such as the sanction letter and the DDO certificate.">
        <SignatureCard />
      </Section>
      <Card padded={false}>
        <Row icon={KeyRound} label="Change password" onPress={() => router.push('/staff/account/password')} />
      </Card>
    </Screen>
  );
}
