// ST-48m One office voucher (G2, D-112), with the printable on the console.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Loaded, StaffDocument } from '@/components/staff';
import { api } from '@/lib/api';
import { officeVoucherHtml } from '@/lib/staffDocuments';
import { documentFileName } from '@/lib/documents';
import { Banner, Card, Header, MetadataListItem, Screen, Text } from '@/ui';
import { spacing } from '@/theme';

export default function Voucher() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['office-voucher', id], queryFn: () => api.accounts.voucher(id) });
  return (
    <Loaded page q={q} what="this voucher">
      {(v) => (
        <Screen header={<Header title={v.kind === 'PAYMENT' ? 'Payment voucher' : 'Receipt voucher'} onBack={() => router.back()} />} footer={<StaffDocument title={`Voucher ${v.voucherNo}`} fileName={documentFileName('Voucher', v.voucherNo)} build={(o) => officeVoucherHtml(v, o)} />}>
          <View style={{ gap: spacing[1] }}>
            <Text type="display-3">{formatINR(v.amount)}</Text>
            <Text type="supporting" tone="secondary">
              Rupees {amountInWords(v.amount)} only
            </Text>
          </View>
          {v.reversed ? <Banner status="warning" heading="Cancelled" description="Its entry in the books was reversed." /> : null}
          <Card>
            <MetadataListItem label="Voucher" value={v.voucherNo} />
            <MetadataListItem label="Date" value={formatDisplayDate(v.date)} />
            <MetadataListItem label={v.kind === 'PAYMENT' ? 'Paid to' : 'Received from'} value={v.party} />
            <MetadataListItem label="For" value={v.narration} />
            <MetadataListItem label="Head" value={`${v.headCode} ${v.headName}`} />
            <MetadataListItem label={v.kind === 'PAYMENT' ? 'Paid by' : 'Received by'} value={v.mode === 'CASH' ? 'Cash' : `Bank · ${v.reference ?? ''}`} />
            <MetadataListItem label="Entry" value={v.entryNo} />
            <MetadataListItem label="Entered by" value={`${v.createdByName} · ${formatDisplayDateTime(v.createdAt)}`} />
          </Card>
        </Screen>
      )}
    </Loaded>
  );
}
