import { PiggyBank } from 'lucide-react-native';
import { AppText, ComingSoon, Screen } from '@/components/ui';

/** MB-08, MB-09, MB-15 (docs/05). */
export default function Deposits() {
  return (
    <Screen>
      <AppText variant="title">Deposits</AppText>
      <ComingSoon
        icon={PiggyBank}
        title="Your deposits live here"
        body="See CRD, SRDS, Savings and Fixed Deposits, open an FD and download your FD receipt."
        milestone="M6"
      />
    </Screen>
  );
}
