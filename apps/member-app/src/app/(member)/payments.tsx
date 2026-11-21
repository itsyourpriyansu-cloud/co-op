// MB-10 Payments & statements (read-only, D-010 / D-043): what is unpaid, month by month demand vs
// deducted with the head-wise allocation (BR-011), receipts, and the payments I reported.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, Plus, ReceiptIndianRupee } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { MyPayments } from '@tgs/types';
import { MODE_LABEL, SOURCE_LABEL, useMyPayments } from '@/lib/payments';
import { Banner, Button, Card, EmptyState, Screen, SegmentedControl, Skeleton, StatusToken, Token, Text, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

type Seg = 'MONTHS' | 'RECEIPTS' | 'REPORTED';

function MonthCard({ m, open, onToggle }: { m: MyPayments['months'][number]; open: boolean; onToggle: () => void }) {
  const posted = m.sheetStatus === 'RECOVERY_POSTED';
  return (
    <Card onPress={onToggle}>
      <View style={{ gap: spacing[2] }}>
        <View style={styles.row}>
          <Text type="h4" style={{ flex: 1 }}>
            {formatCycle(m.cycle)}
          </Text>
          {posted ? m.short ? <Token text={`Short ${formatINR(m.short)}`} status="error" size="xs" /> : <Token text="Paid in full" status="success" size="xs" /> : <Token text="Being deducted" status="info" size="xs" />}
          {open ? <ChevronUp size={18} color={color.text.secondary} /> : <ChevronDown size={18} color={color.text.secondary} />}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text type="supporting" tone="secondary">
              Demand
            </Text>
            <Text type="body" weight="medium">{formatINR(m.demand)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text type="supporting" tone="secondary">
              {posted ? 'Paid' : 'Status'}
            </Text>
            <Text type="body" weight="medium" tone={posted && m.short ? 'error' : 'primary'}>
              {posted ? formatINR(m.recovered ?? 0) : 'With your DDO'}
            </Text>
          </View>
        </View>
        {open ? (
          <View style={styles.breakdown}>
            <Text type="supporting" tone="secondary">
              {posted ? 'How it was applied (in the society order)' : 'What will be deducted'}
            </Text>
            {m.components.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text type="supporting" style={{ flex: 1 }}>
                  {i + 1}. {c.label}
                  {c.loanNo ? ` · ${c.loanNo}` : ''}
                </Text>
                {posted ? (
                  <Text type="supporting" tone={c.allocated < c.amount ? 'error' : 'success'}>
                    {formatINR(c.allocated)} / {formatINR(c.amount)}
                  </Text>
                ) : (
                  <Text type="supporting">{formatINR(c.amount)}</Text>
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
        <Text type="h1" style={{ flex: 1 }}>
          Payments
        </Text>
        <Button label="Report" size="sm" icon={Plus} onPress={() => router.push('/payment/report')} />
      </View>

      {q.isLoading ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton height={110} radius={radius.container} />
          <Skeleton height={120} radius={radius.container} />
          <Skeleton height={120} radius={radius.container} />
        </View>
      ) : q.isError || !d ? (
        <Banner status="error" heading="Couldn't load your payments" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <>
          {owed > 0 ? (
            <Banner
              status="warning"
              heading={`${formatINR(owed)} unpaid`}
              description={`${d.dues.arrears.length ? `From ${d.dues.arrears.map((a) => formatCycle(a.cycle)).join(', ')} when your salary deduction came short. ` : ''}${d.dues.totalPenal ? `Includes ${formatINR(d.dues.totalPenal)} penal interest, which grows each day until paid. ` : ''}${d.dues.shareCapitalDue ? `Share capital ${formatINR(d.dues.shareCapitalDue)}. ` : ''}${d.dues.suretyRecoveries?.length ? `As a surety you are asked to pay ${d.dues.suretyRecoveries.map((r) => `${formatINR(r.due)} for ${r.borrowerName}'s loan ${r.loanNo}`).join(' and ')}; pay it at the counter or it comes off your next salary. ` : ''}Pay at the counter, or pay by bank / UPI and report it here.${pending ? ` ${pending} report${pending === 1 ? ' is' : 's are'} being verified.` : ''}`}
              action={{ text: 'Report a payment', onPress: () => router.push('/payment/report') }}
            />
          ) : (
            <View style={styles.ok}>
              <CircleCheck size={18} color={color.status.success.text} />
              <Text type="supporting" tone="success" style={{ flex: 1 }}>
                Nothing unpaid. Every month was deducted in full.
              </Text>
            </View>
          )}

          <SegmentedControl
            label="Show"
            hideLabel
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
              <View style={{ gap: spacing[3] }}>
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
                  <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/payment/receipt/[id]', params: { id: r.id } })} style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && { backgroundColor: color.background.muted }]}>
                    <View style={{ flex: 1, gap: spacing[0.5] }}>
                      <Text type="label">{SOURCE_LABEL[r.source]}</Text>
                      <Text type="supporting" tone="secondary">
                        {r.receiptNo} · {formatDisplayDate(r.date)}
                        {r.cycle ? ` · ${formatCycle(r.cycle)}` : ''}
                        {r.cancelled ? ' · Cancelled' : ''}
                      </Text>
                    </View>
                    <Text type="body" weight="medium" tone="credit">
                      {formatINR(r.amount)}
                    </Text>
                    <ChevronRight size={18} color={color.text.secondary} />
                  </Pressable>
                ))}
              </Card>
            ) : (
              <EmptyState icon={ReceiptIndianRupee} title="No receipts yet" />
            )
          ) : d.reports.length ? (
            <View style={{ gap: spacing[3] }}>
              {d.reports.map((r) => (
                <Card key={r.id}>
                  <View style={{ gap: spacing[1.5] }}>
                    <View style={styles.row}>
                      <Text type="body" weight="medium" style={{ flex: 1 }}>
                        {formatINR(r.amount)}
                      </Text>
                      <StatusToken entity="paymentReport" status={r.status} size="xs" />
                    </View>
                    <Text type="supporting" tone="secondary">
                      {MODE_LABEL[r.mode]} · {r.reference} · paid {formatDisplayDate(r.paidOn)}
                    </Text>
                    {r.status === 'REJECTED' && r.rejectReason ? (
                      <Text type="supporting" tone="error">
                        {r.rejectReason}
                      </Text>
                    ) : null}
                    {r.status === 'VERIFIED' && r.receiptId ? <Link label="View receipt" onPress={() => router.push({ pathname: '/payment/receipt/[id]', params: { id: r.receiptId! } })} /> : null}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  ok: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.container, backgroundColor: color.status.success.tint },
  breakdown: { gap: spacing[1.5], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: color.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
});
