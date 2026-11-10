// SYS-02m: a link that leads nowhere.
import { router } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { EmptyState, Header, Screen } from '@/ui';

export default function NotFound() {
  return (
    <Screen header={<Header />}>
      <EmptyState icon={Compass} title="Page not found" description="The link may be outdated, or the record was removed." action={{ text: 'Go to home', onPress: () => router.replace('/') }} />
    </Screen>
  );
}
