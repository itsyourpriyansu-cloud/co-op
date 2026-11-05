// F-01 (D-096): Profile → My signature.
import { router } from 'expo-router';
import { SignatureCard } from '@/components/SignatureCard';
import { Header, Screen } from '@/ui';

export default function SignatureScreen() {
  return (
    <Screen header={<Header title="My signature" onBack={() => router.back()} />}>
      <SignatureCard />
    </Screen>
  );
}
