import { ReceiptIndianRupee } from 'lucide-react-native';
import { AppText, ComingSoon, Screen } from '@/components/ui';

/** MB-10 (docs/05). Read-only by design (D-010). */
export default function Payments() {
  return (
    <Screen>
      <AppText variant="title">Payments</AppText>
      <ComingSoon
        icon={ReceiptIndianRupee}
        title="Your statements live here"
        body="Monthly salary deductions, what was paid towards each head, and your receipts."
        milestone="M7"
      />
    </Screen>
  );
}
