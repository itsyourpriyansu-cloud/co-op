// MB-01 Home: live snapshot from GET /me/home — what I have (deposits, shares), what I owe (loans,
// unpaid), this month's salary deduction, things waiting for me (surety, corrections, FD payment,
// unpaid dues), quick actions and the bell with the unread count.
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bell, Calculator, ChevronRight, HandCoins, PiggyBank, ReceiptIndianRupee, type LucideIcon } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { MemberHome } from '@tgs/types';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { useHome } from '@/lib/account';
import { Alert, Card, Screen, Section, Skeleton, StatusTag, Tag, Text } from '@/ui';
import { color, radius, space, onBrandMuted, onBrandTile } from '@/theme';

const TONE = { primary: 'primary', warning: 'warning', danger: 'error' } as const;

export default function Home() {
  const { session } = useAuth();
  const q = useHome();
  const h = q.data;
  const firstName = (h?.member.name ?? session?.user.name ?? '').split(' ')[0];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={styles.greeting}>
        <Logo size={44} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">Hello, {firstName}</Text>
          <Text role="caption" tone="secondary">
            General No. {h?.member.generalNo ?? session?.user.generalNo}
            {h ? ` · ${h.member.departmentName}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={h?.unreadNotifications ? `Notifications, ${h.unreadNotifications} unread` : 'Notifications'} onPress={() => router.push('/account/notifications')} style={styles.bell} hitSlop={8}>
          <Bell size={22} color={color.text.primary} strokeWidth={1.75} />
          {h?.unreadNotifications ? (
            <View style={styles.badge}>
              <Text role="captionStrong" tone="onBrand" style={{ fontSize: 10, lineHeight: 14 }}>
                {h.unreadNotifications > 9 ? '9+' : h.unreadNotifications}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {q.isLoading ? (
        <View style={{ gap: space[8] }}>
          <Skeleton height={190} radius={radius.card} />
          <Skeleton height={80} radius={radius.card} />
          <Skeleton height={140} radius={radius.card} />
        </View>
      ) : q.isError || !h ? (
        <Alert type="error" heading="Couldn't load your snapshot" description="Pull down to try again, or check your connection." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <>
          <Snapshot h={h} />
          {h.actions.length ? (
            <Section title="Waiting for you">
              <View style={{ gap: space[4] }}>
                {h.actions.map((a) => (
                  <Card key={a.key} onPress={() => router.push(a.link as Href)}>
                    <View style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: a.tone === 'danger' ? color.status.danger.solid : a.tone === 'warning' ? color.status.warning.solid : color.brand.solid }]} />
                      <View style={{ flex: 1, gap: space[1] }}>
                        <Text role="label">{a.title}</Text>
                        <Text role="caption" tone="secondary">
                          {a.detail}
                        </Text>
                      </View>
                      <Tag text={a.tone === 'danger' ? 'Due' : a.tone === 'warning' ? 'Action' : 'Next'} color={TONE[a.tone]} size="xs" />
                      <ChevronRight size={18} color={color.text.tertiary} />
                    </View>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}

          <View style={styles.grid}>
            <Action icon={HandCoins} label="Apply loan" onPress={() => router.push('/loan/apply')} />
            <Action icon={PiggyBank} label="Open FD" onPress={() => router.push('/deposit/open')} />
            <Action icon={Calculator} label="Calculator" onPress={() => router.push('/account/calculators')} />
            <Action icon={ReceiptIndianRupee} label="Payments" onPress={() => router.push('/payments')} />
          </View>

          {h.thisMonth ? (
            <Card onPress={() => router.push('/payments')}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="caption" tone="secondary">
                    Salary deduction · {formatCycle(h.thisMonth.cycle)}
                  </Text>
                  <Text role="cardTitle">{formatINR(h.thisMonth.demand)}</Text>
                </View>
                <StatusTag entity="demandSheet" status={h.thisMonth.status} size="xs" />
                <ChevronRight size={18} color={color.text.tertiary} />
              </View>
            </Card>
          ) : null}

          <Section title="My loans" right={<Text role="captionStrong" tone="link" onPress={() => router.push('/loans')}>See all</Text>}>
            {h.loans.length ? (
              <Card padded={false}>
                {h.loans.map((l, i) => (
                  <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push(`/loan/${l.id}`)} style={({ pressed }) => [styles.listRow, i > 0 && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
                    <View style={{ flex: 1, gap: space[1] }}>
                      <Text role="label">{l.productName}</Text>
                      <Text role="caption" tone="secondary">
                        {l.loanNo}
                        {l.nextDue ? ` · next ${formatINR(l.nextDue.amount)} in ${formatCycle(l.nextDue.cycle)}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                      <Text role="label">{formatINR(l.outstanding)}</Text>
                      <Text role="caption" tone="tertiary">
                        to repay
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Card onPress={() => router.push('/account/calculators')}>
                <Text role="body" tone="secondary">
                  No running loans. See what you could borrow with the calculator.
                </Text>
              </Card>
            )}
          </Section>

          {h.deposits.nextMaturity ? (
            <Card onPress={() => router.push('/deposits')}>
              <View style={styles.row}>
                <PiggyBank size={22} color={color.brand.solid} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="label">Next FD matures {formatDisplayDate(h.deposits.nextMaturity.date)}</Text>
                  <Text role="caption" tone="secondary">
                    {h.deposits.nextMaturity.fdrNo} · {formatINR(h.deposits.nextMaturity.amount)}
                  </Text>
                </View>
                <ChevronRight size={18} color={color.text.tertiary} />
              </View>
            </Card>
          ) : null}

          <Text role="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            {h.member.designation} · {h.member.leftoverLabel} of service left
          </Text>
        </>
      )}
    </Screen>
  );
}

function Snapshot({ h }: { h: MemberHome }) {
  return (
    <View style={styles.hero} accessible accessibilityLabel={`Deposits ${formatINR(h.deposits.total)}. Loans to repay ${formatINR(h.loansOutstanding)}. Share capital ${formatINR(h.shares.capital)}.`}>
      <Text role="caption" style={styles.heroDim}>
        My savings with the society
      </Text>
      <Text role="display" tone="onBrand">
        {formatINR(h.deposits.total + h.shares.capital + h.shares.shareDeposit)}
      </Text>
      <View style={styles.heroGrid}>
        <Figure label="Deposits" value={formatINR(h.deposits.total)} sub={h.deposits.fdCount ? `${h.deposits.fdCount} FD${h.deposits.fdCount > 1 ? 's' : ''} + CRD, SRDS` : 'CRD, SRDS, savings'} onPress={() => router.push('/deposits')} />
        <Figure label="Shares" value={formatINR(h.shares.capital)} sub={`${h.shares.count} shares`} onPress={() => router.push('/profile')} />
        <Figure label="Loans" value={formatINR(h.loansOutstanding)} sub={h.loans.length ? `${h.loans.length} running` : 'None'} onPress={() => router.push('/loans')} />
      </View>
      {h.unpaid ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/payments')} style={styles.unpaid}>
          <Text role="captionStrong" style={{ color: color.status.danger.fg, flex: 1 }}>
            {formatINR(h.unpaid)} unpaid
          </Text>
          <Text role="captionStrong" style={{ color: color.status.danger.fg }}>
            Pay or report
          </Text>
          <ChevronRight size={16} color={color.status.danger.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Figure({ label, value, sub, onPress }: { label: string; value: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.figure, pressed && { opacity: 0.75 }]}>
      <Text role="caption" style={styles.heroDim}>
        {label}
      </Text>
      <Text role="label" tone="onBrand">
        {value}
      </Text>
      <Text role="caption" style={styles.heroDim} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

function Action({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.actionIcon}>
        <Icon size={22} color={color.brand.solid} strokeWidth={1.75} />
      </View>
      <Text role="caption">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.surface, borderWidth: 1, borderColor: color.border.default },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.status.danger.solid, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: color.brand.solid, borderRadius: radius.card, padding: space[10], gap: space[4] },
  heroDim: { color: onBrandMuted },
  heroGrid: { flexDirection: 'row', gap: space[3], marginTop: space[4] },
  figure: { flex: 1, gap: space[1], padding: space[5], borderRadius: radius.control, backgroundColor: onBrandTile },
  unpaid: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[2], padding: space[5], borderRadius: radius.control, backgroundColor: color.status.danger.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { alignItems: 'center', gap: space[3], width: '23%' },
  actionIcon: { width: 56, height: 56, borderRadius: radius.card, backgroundColor: color.bg.surface, borderWidth: 1, borderColor: color.border.default, alignItems: 'center', justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], paddingHorizontal: space[8], paddingVertical: space[6] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
