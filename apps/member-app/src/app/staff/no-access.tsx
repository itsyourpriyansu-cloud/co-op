// SYS-01m
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { EmptyState, Header, Screen } from '@/ui';

export default function NoAccess() {
  return (
    <Screen header={<Header />}>
      <EmptyState icon={Lock} tone="warning" title="You don't have access to this" description="Ask the Super Admin if you need it for your work." action={{ text: 'Back to home', onPress: () => router.replace('/staff/home') }} />
    </Screen>
  );
}
