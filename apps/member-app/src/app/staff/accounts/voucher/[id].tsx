// ST-48m One office voucher (G2, D-112), with the printable on the console.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Loaded, PrintButton } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Card, Header, KeyValue, Screen, Text } from '@/ui';
import { space } from '@/theme';

export default function Voucher() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['office-voucher', id], queryFn: () => api.accounts.voucher(id) });
  return (
    <Loaded page q={q} what="this voucher">
      {(v) => (
        <Screen header={<Header title={v.kind === 'PAYMENT' ? 'Payment voucher' : 'Receipt voucher'} onBack={() => router.back()} />} footer={<PrintButton path={`/reports/print/office-voucher?id=${v.id}`} text="Print voucher" />}>
          <View style={{ gap: space[2] }}>
            <Text role="metric">{formatINR(v.amount)}</Text>
            <Text role="caption" tone="tertiary">
              Rupees {amountInWords(v.amount)} only
            </Text>
          </View>
          {v.reversed ? <Alert type="warning" heading="Cancelled" description="Its entry in the books was reversed." /> : null}
          <Card>
            <KeyValue label="Voucher" value={v.voucherNo} />
            <KeyValue label="Date" value={formatDisplayDate(v.date)} />
            <KeyValue label={v.kind === 'PAYMENT' ? 'Paid to' : 'Received from'} value={v.party} />
            <KeyValue label="For" value={v.narration} />
            <KeyValue label="Head" value={`${v.headCode} ${v.headName}`} />
            <KeyValue label={v.kind === 'PAYMENT' ? 'Paid by' : 'Received by'} value={v.mode === 'CASH' ? 'Cash' : `Bank · ${v.reference ?? ''}`} />
            <KeyValue label="Entry" value={v.entryNo} />
            <KeyValue label="Entered by" value={`${v.createdByName} · ${formatDisplayDateTime(v.createdAt)}`} />
          </Card>
        </Screen>
      )}
    </Loaded>
  );
}
