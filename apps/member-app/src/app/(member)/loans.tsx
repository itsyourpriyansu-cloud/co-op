import { HandCoins } from 'lucide-react-native';
import { AppText, ComingSoon, Screen } from '@/components/ui';

/** MB-03 – MB-07 (docs/05). */
export default function Loans() {
  return (
    <Screen>
      <AppText variant="title">Loans</AppText>
      <ComingSoon
        icon={HandCoins}
        title="Your loans live here"
        body="Apply for Ordinary, Education or Salary loans, request top-ups and confirm surety requests."
        milestone="M4 – M5"
      />
    </Screen>
  );
}
