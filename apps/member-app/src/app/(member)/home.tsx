// MB-01 Home: live snapshot from GET /me/home — what I have (deposits, shares), what I owe (loans,
// unpaid), this month's salary deduction, things waiting for me (surety, corrections, FD payment,
// unpaid dues), quick actions and the bell with the unread count.
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Bell, Calculator, CalendarClock, ChevronRight, HandCoins, PiggyBank, ReceiptIndianRupee, type LucideIcon } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { MemberHome } from '@tgs/types';
import { AppMark } from '@/components/AppMark';
import { useAuth } from '@/lib/auth';
import { useHome } from '@/lib/account';
import { Banner, Card, CountUp, Screen, Section, Skeleton, StatusToken, Token, Text, usePressScale } from '@/ui';
import { color, radius, shadow, spacing } from '@/theme';

const TONE = { primary: 'info', warning: 'warning', danger: 'error' } as const;

export default function Home() {
  const { session } = useAuth();
  const q = useHome();
  const h = q.data;
  const firstName = (h?.member.name ?? session?.user.name ?? '').split(' ')[0];

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={styles.greeting}>
        <AppMark size={40} />
        <View style={{ flex: 1, gap: spacing[0.5] }}>
          <Text type="h1">Hello, {firstName}</Text>
          <Text type="supporting" tone="secondary">
            General No. {h?.member.generalNo ?? session?.user.generalNo}
            {h ? ` · ${h.member.departmentName}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={h?.unreadNotifications ? `Notifications, ${h.unreadNotifications} unread` : 'Notifications'} onPress={() => router.push('/account/notifications')} style={styles.bell} hitSlop={8}>
          <Bell size={22} color={color.text.primary} strokeWidth={1.75} />
          {h?.unreadNotifications ? (
            <View style={styles.badge}>
              <Text type="supporting" weight="medium" tone="onAccent" style={{ fontSize: 10, lineHeight: 14 }}>
                {h.unreadNotifications > 9 ? '9+' : h.unreadNotifications}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {q.isLoading ? (
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={190} radius={radius.container} />
          <Skeleton height={80} radius={radius.container} />
          <Skeleton height={140} radius={radius.container} />
        </View>
      ) : q.isError || !h ? (
        <Banner status="error" heading="Couldn't load your snapshot" description="Pull down to try again, or check your connection." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : (
        <>
          <Snapshot h={h} />
          {h.actions.length ? (
            <Section title="Waiting for you">
              <View style={{ gap: spacing[2] }}>
                {h.actions.map((a) => (
                  <Card key={a.key} onPress={() => router.push(a.link as Href)}>
                    <View style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: a.tone === 'danger' ? color.status.error.solid : a.tone === 'warning' ? color.status.warning.solid : color.accent }]} />
                      <View style={{ flex: 1, gap: spacing[0.5] }}>
                        <Text type="label">{a.title}</Text>
                        <Text type="supporting" tone="secondary">
                          {a.detail}
                        </Text>
                      </View>
                      <Token text={a.tone === 'danger' ? 'Due' : a.tone === 'warning' ? 'Action' : 'Next'} status={TONE[a.tone]} size="xs" />
                      <ChevronRight size={18} color={color.text.secondary} />
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
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="supporting" tone="secondary">
                    Salary deduction · {formatCycle(h.thisMonth.cycle)}
                  </Text>
                  <Text type="h4">{formatINR(h.thisMonth.demand)}</Text>
                </View>
                <StatusToken entity="demandSheet" status={h.thisMonth.status} size="xs" />
                <ChevronRight size={18} color={color.text.secondary} />
              </View>
            </Card>
          ) : null}

          <Section title="My loans" right={<Text type="supporting" weight="medium" tone="link" onPress={() => router.push('/loans')}>See all</Text>}>
            {h.loans.length ? (
              <Card padded={false}>
                {h.loans.map((l, i) => (
                  <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push(`/loan/${l.id}`)} style={({ pressed }) => [styles.listRow, i > 0 && styles.divider, pressed && { backgroundColor: color.background.muted }]}>
                    <View style={{ flex: 1, gap: spacing[0.5] }}>
                      <Text type="label">{l.productName}</Text>
                      <Text type="supporting" tone="secondary">
                        {l.loanNo}
                        {l.nextDue ? ` · next ${formatINR(l.nextDue.amount)} in ${formatCycle(l.nextDue.cycle)}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: spacing[0.5] }}>
                      <Text type="label">{formatINR(l.outstanding)}</Text>
                      <Text type="supporting" tone="secondary">
                        to repay
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <Card onPress={() => router.push('/account/calculators')}>
                <Text type="body" tone="secondary">
                  No running loans. See what you could borrow with the calculator.
                </Text>
              </Card>
            )}
          </Section>

          {h.deposits.nextMaturity ? (
            <Card onPress={() => router.push('/deposits')}>
              <View style={styles.row}>
                <PiggyBank size={22} color={color.accent} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="label">Next FD matures {formatDisplayDate(h.deposits.nextMaturity.date)}</Text>
                  <Text type="supporting" tone="secondary">
                    {h.deposits.nextMaturity.fdrNo} · {formatINR(h.deposits.nextMaturity.amount)}
                  </Text>
                </View>
                <ChevronRight size={18} color={color.text.secondary} />
              </View>
            </Card>
          ) : null}

          {/* D-131: service remaining, from the date of birth and the society's retirement age. */}
          {h.service ? (
            <Card>
              <View style={styles.row} accessible accessibilityLabel={`Service remaining ${h.service.label}, ${h.service.days} days. Retires on ${formatDisplayDate(h.service.dor)}.`}>
                <CalendarClock size={22} color={color.accent} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="supporting" tone="secondary">
                    Service remaining
                  </Text>
                  <Text type="label">
                    {h.service.label} ({h.service.days.toLocaleString('en-IN')} days)
                  </Text>
                  <Text type="supporting" tone="secondary">
                    {h.member.designation} · retires on {formatDisplayDate(h.service.dor)}
                  </Text>
                </View>
              </View>
            </Card>
          ) : (
            <Text type="supporting" tone="secondary" style={{ textAlign: 'center' }}>
              {h.member.designation} · {h.member.leftoverLabel} of service left
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Snapshot({ h }: { h: MemberHome }) {
  return (
    <View style={styles.hero} accessible accessibilityLabel={`Deposits ${formatINR(h.deposits.total)}. Loans to repay ${formatINR(h.loansOutstanding)}. Share capital ${formatINR(h.shares.capital)}.`}>
      <Text type="supporting" style={styles.heroDim}>
        My savings with the society
      </Text>
      <CountUp type="display-2" tone="onAccent" value={h.deposits.total + h.shares.capital + h.shares.shareDeposit} format={formatINR} adjustsFontSizeToFit numberOfLines={1} />
      <View style={styles.heroGrid}>
        <Figure label="Deposits" value={formatINR(h.deposits.total)} sub={h.deposits.fdCount ? `${h.deposits.fdCount} FD${h.deposits.fdCount > 1 ? 's' : ''} + CRD, SRDS` : 'CRD, SRDS, savings'} onPress={() => router.push('/deposits')} />
        <Figure label="Shares" value={formatINR(h.shares.capital)} sub={`${h.shares.count} shares`} onPress={() => router.push('/profile')} />
        <Figure label="Loans" value={formatINR(h.loansOutstanding)} sub={h.loans.length ? `${h.loans.length} running` : 'None'} onPress={() => router.push('/loans')} />
      </View>
      {h.unpaid ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/payments')} style={styles.unpaid}>
          <Text type="supporting" weight="medium" style={{ color: color.status.error.text, flex: 1 }}>
            {formatINR(h.unpaid)} unpaid
          </Text>
          <Text type="supporting" weight="medium" style={{ color: color.status.error.text }}>
            Pay or report
          </Text>
          <ChevronRight size={16} color={color.status.error.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Figure({ label, value, sub, onPress }: { label: string; value: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.figure, pressed && { opacity: 0.75 }]}>
      <Text type="supporting" style={styles.heroDim}>
        {label}
      </Text>
      <Text type="label" tone="onAccent">
        {value}
      </Text>
      <Text type="supporting" style={styles.heroDim} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

function Action({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { scaleStyle, pressHandlers } = usePressScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} {...pressHandlers} style={styles.action}>
      {({ pressed }) => (
        <>
          <Animated.View style={[styles.actionIcon, pressed && styles.actionPressed, scaleStyle]}>
            <Icon size={22} color={color.accent} strokeWidth={1.75} />
          </Animated.View>
          <Text type="supporting" weight="medium">
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.background.surface, borderWidth: 1, borderColor: color.border },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.status.error.solid, alignItems: 'center', justifyContent: 'center' },
  // The screen's one gold moment: a hairline ring on the raised navy card.
  hero: { backgroundColor: color.accent, borderRadius: radius.container, borderCurve: 'continuous', borderWidth: 1, borderColor: color.gold, padding: spacing[5], gap: spacing[2], boxShadow: shadow.med },
  heroDim: { color: color.text.onAccentMuted },
  heroGrid: { flexDirection: 'row', gap: spacing[1.5], marginTop: spacing[2] },
  figure: { flex: 1, gap: spacing[0.5], padding: spacing[2], borderRadius: radius.element, backgroundColor: color.accentTile },
  unpaid: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5], marginTop: spacing[1], padding: spacing[2], borderRadius: radius.element, backgroundColor: color.status.error.tint },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { alignItems: 'center', gap: spacing[1.5], width: '23%' },
  actionIcon: { width: 56, height: 56, borderRadius: radius.container, borderCurve: 'continuous', backgroundColor: color.background.surface, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  actionPressed: { backgroundColor: color.accentMuted },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
});
