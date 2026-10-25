// MB-10 Payments & statements (read-only, D-010 / D-043): what is unpaid, month by month demand vs
// deducted with the head-wise allocation (BR-011), receipts, and the payments I reported.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, Plus, ReceiptIndianRupee } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { MyPayments } from '@tgs/types';
import { MODE_LABEL, SOURCE_LABEL, useMyPayments } from '@/lib/payments';
import { Alert, Button, Card, EmptyState, Screen, Segmented, Skeleton, StatusTag, Tag, Text } from '@/ui';
import { color, radius, space } from '@/theme';

type Seg = 'MONTHS' | 'RECEIPTS' | 'REPORTED';

function MonthCard({ m, open, onToggle }: { m: MyPayments['months'][number]; open: boolean; onToggle: () => void }) {
  const posted = m.sheetStatus === 'RECOVERY_POSTED';
  return (
    <Card onPress={onToggle}>
      <View style={{ gap: space[4] }}>
        <View style={styles.row}>
          <Text role="cardTitle" style={{ flex: 1 }}>
            {formatCycle(m.cycle)}
          </Text>
          {posted ? m.short ? <Tag text={`Short ${formatINR(m.short)}`} color="error" size="xs" /> : <Tag text="Paid in full" color="success" size="xs" /> : <Tag text="Being deducted" color="primary" size="xs" />}
          {open ? <ChevronUp size={18} color={color.text.tertiary} /> : <ChevronDown size={18} color={color.text.tertiary} />}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text role="caption" tone="tertiary">
              Demand
            </Text>
            <Text role="bodyStrong">{formatINR(m.demand)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text role="caption" tone="tertiary">
              {posted ? 'Paid' : 'Status'}
            </Text>
            <Text role="bodyStrong" tone={posted && m.short ? 'danger' : 'primary'}>
              {posted ? formatINR(m.recovered ?? 0) : 'With your DDO'}
            </Text>
          </View>
        </View>
        {open ? (
          <View style={styles.breakdown}>
            <Text role="caption" tone="tertiary">
              {posted ? 'How it was applied (in the society order)' : 'What will be deducted'}
            </Text>
            {m.components.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text role="caption" style={{ flex: 1 }}>
                  {i + 1}. {c.label}
                  {c.loanNo ? ` · ${c.loanNo}` : ''}
                </Text>
                {posted ? (
                  <Text role="caption" tone={c.allocated < c.amount ? 'danger' : 'success'}>
                    {formatINR(c.allocated)} / {formatINR(c.amount)}
                  </Text>
                ) : (
                  <Text role="caption">{formatINR(c.amount)}</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function Payments() {
  const q = useMyPayments();
  const [seg, setSeg] = useState<Seg>('MONTHS');
  const [open, setOpen] = useState<string | null>(null);
  const d = q.data;
  const owed = d ? d.dues.totalArrears + d.dues.shareCapitalDue : 0;
  const pending = d ? d.reports.filter((r) => r.status === 'REPORTED').length : 0;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={styles.row}>
        <Text role="pageTitle" style={{ flex: 1 }}>
          Payments
        </Text>
        <Button text="Report" size="sm" leftSlot={Plus} onPress={() => router.push('/payment/report')} />
      </View>

      {q.isLoading ? (
        <View style={{ gap: space[6] }}>
          <Skeleton height={110} radius={radius.card} />
          <Skeleton height={120} radius={radius.card} />
          <Skeleton height={120} radius={radius.card} />
        </View>
      ) : q.isError || !d ? (
        <Alert type="error" heading="Couldn't load your payments" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <>
          {owed > 0 ? (
            <Alert
              type="warning"
              heading={`${formatINR(owed)} unpaid`}
              description={`${d.dues.arrears.length ? `From ${d.dues.arrears.map((a) => formatCycle(a.cycle)).join(', ')} when your salary deduction came short. ` : ''}${d.dues.shareCapitalDue ? `Share capital ${formatINR(d.dues.shareCapitalDue)}. ` : ''}Pay at the counter, or pay by bank / UPI and report it here.${pending ? ` ${pending} report${pending === 1 ? ' is' : 's are'} being verified.` : ''}`}
              action={{ text: 'Report a payment', onPress: () => router.push('/payment/report') }}
            />
          ) : (
            <View style={styles.ok}>
              <CircleCheck size={18} color={color.status.success.fg} />
              <Text role="caption" tone="success" style={{ flex: 1 }}>
                Nothing unpaid. Every month was deducted in full.
              </Text>
            </View>
          )}

          <Segmented
            label="Show"
            value={seg}
            options={[
              { value: 'MONTHS', label: 'Monthly' },
              { value: 'RECEIPTS', label: `Receipts ${d.receipts.length || ''}`.trim() },
              { value: 'REPORTED', label: `Reported ${d.reports.length || ''}`.trim() },
            ]}
            onChange={setSeg}
          />

          {seg === 'MONTHS' ? (
            d.months.length ? (
              <View style={{ gap: space[6] }}>
                {d.months.map((m) => (
                  <MonthCard key={m.cycle} m={m} open={open === m.cycle} onToggle={() => setOpen(open === m.cycle ? null : m.cycle)} />
                ))}
              </View>
            ) : (
              <EmptyState icon={ReceiptIndianRupee} title="No deductions yet" description="Your first monthly demand appears here once the society generates it." />
            )
          ) : seg === 'RECEIPTS' ? (
            d.receipts.length ? (
              <Card padded={false}>
                {d.receipts.map((r, i) => (
                  <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/payment/receipt/[id]', params: { id: r.id } })} style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
                    <View style={{ flex: 1, gap: space[1] }}>
                      <Text role="label">{SOURCE_LABEL[r.source]}</Text>
                      <Text role="caption" tone="tertiary">
                        {r.receiptNo} · {formatDisplayDate(r.date)}
                        {r.cycle ? ` · ${formatCycle(r.cycle)}` : ''}
                      </Text>
                    </View>
                    <Text role="bodyStrong" tone="credit">
                      {formatINR(r.amount)}
                    </Text>
                    <ChevronRight size={18} color={color.text.tertiary} />
                  </Pressable>
                ))}
              </Card>
            ) : (
              <EmptyState icon={ReceiptIndianRupee} title="No receipts yet" />
            )
          ) : d.reports.length ? (
            <View style={{ gap: space[6] }}>
              {d.reports.map((r) => (
                <Card key={r.id}>
                  <View style={{ gap: space[3] }}>
                    <View style={styles.row}>
                      <Text role="bodyStrong" style={{ flex: 1 }}>
                        {formatINR(r.amount)}
                      </Text>
                      <StatusTag entity="paymentReport" status={r.status} size="xs" />
                    </View>
                    <Text role="caption" tone="tertiary">
                      {MODE_LABEL[r.mode]} · {r.reference} · paid {formatDisplayDate(r.paidOn)}
                    </Text>
                    {r.status === 'REJECTED' && r.rejectReason ? (
                      <Text role="caption" tone="danger">
                        {r.rejectReason}
                      </Text>
                    ) : null}
                    {r.status === 'VERIFIED' && r.receiptId ? <Button text="View receipt" size="sm" buttonType="secondary" subType="inline" onPress={() => router.push({ pathname: '/payment/receipt/[id]', params: { id: r.receiptId! } })} /> : null}
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <EmptyState icon={ReceiptIndianRupee} title="Nothing reported" description="Paid the society by bank transfer or UPI? Report it so the cashier can match it and give you a receipt." action={{ text: 'Report a payment', onPress: () => router.push('/payment/report') }} />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  ok: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[6], borderRadius: radius.card, backgroundColor: color.status.success.bg },
  breakdown: { gap: space[3], paddingTop: space[4], borderTopWidth: 1, borderTopColor: color.border.subtle },
  item: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[8], paddingVertical: space[6] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
