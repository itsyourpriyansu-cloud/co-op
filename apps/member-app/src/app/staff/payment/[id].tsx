// ST-46m Receipt: who paid what for which month and head, the notes counted, and the printable letterhead copy.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DENOMINATIONS, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Loaded, PrintButton } from '@/components/staff';
import { api } from '@/lib/api';
import { PURPOSE_LABEL, SOURCE_LABEL } from '@/lib/staffCollections';
import { Card, Header, KeyValue, Screen, Section, Text } from '@/ui';
import { space } from '@/theme';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.receipts.get(id) });
  return (
    <Screen header={<Header title="Receipt" onBack={() => router.back()} />}>
      <Loaded q={q} what="this receipt">
        {(d) => {
          const r = d.receipt;
          return (
            <>
              <View style={{ gap: space[2] }}>
                <Text role="pageTitle">{formatINR(r.amount)}</Text>
                <Text role="caption" tone="secondary">
                  {r.receiptNo} · {formatDisplayDate(r.date)}
                </Text>
                <Text role="caption" tone="tertiary">
                  {d.amountInWords}
                </Text>
              </View>
              <Card>
                <KeyValue label="Received from" value={d.member.name} />
                <KeyValue label="General No." value={d.member.generalNo} />
                <KeyValue label="Office" value={`${d.member.designation}, ${d.member.departmentName}`} />
                <KeyValue label="Mode" value={`${SOURCE_LABEL[r.source]}${r.reference ? ` · ${r.reference}` : ''}`} />
                {r.purpose ? <KeyValue label="Towards" value={PURPOSE_LABEL[r.purpose]} /> : d.sheet ? <KeyValue label="Against" value={`${formatCycle(d.sheet.cycle)} demand of ${d.sheet.departmentName}`} /> : null}
                <KeyValue label="Recorded by" value={`${r.byName ?? 'Salary recovery (DDO)'}${r.at ? ` · ${formatDisplayDateTime(r.at)}` : ''}`} />
              </Card>
              {d.lines.length ? (
                <Section title="Applied to">
                  <Card>
                    {d.lines.map((l, i) => (
                      <KeyValue key={i} label={`${l.cycle ? `${formatCycle(l.cycle)} · ` : ''}${l.label}${l.loanNo ? ` · ${l.loanNo}` : ''}`} value={formatINR(l.amount)} />
                    ))}
                    <KeyValue label="Total" value={formatINR(r.amount)} emphasis />
                  </Card>
                </Section>
              ) : null}
              {r.denominations ? (
                <Text role="caption" tone="secondary">
                  Notes counted:{' '}
                  {DENOMINATIONS.filter((n) => r.denominations?.[n])
                    .map((n) => `₹${n} × ${r.denominations![n]}`)
                    .join(' · ')}
                </Text>
              ) : null}
              {r.remarks ? (
                <Text role="caption" tone="secondary">
                  Remarks: {r.remarks}
                </Text>
              ) : null}
              {d.report ? (
                <Text role="caption" tone="secondary">
                  Reported by the member in the app on {d.report.reportedAt ? formatDisplayDateTime(d.report.reportedAt) : formatDisplayDate(d.report.paidOn)} and verified against the bank statement.
                </Text>
              ) : null}
              <PrintButton path={`/payments/${r.id}`} />
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
