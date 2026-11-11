// ST-01m Dashboard. Super Admin: KPIs, attention, pipeline, collections, risks. Other roles: their variant,
// computed by the server from the same Work Queue, so the counts always agree.
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, CircleCheck, Search } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR, formatINRCompact, fullMonthsBetween } from '@tgs/domain';
import { ROLE_LABELS, type DashboardSummary, type DemandSheetStatus, type DepositStatus, type LoanStatus, type MembershipStatus, type RoleDashboard } from '@tgs/types';
import { AppMark } from '@/components/AppMark';
import { Loaded, Meter, StatTile, staffHref, TileGrid, WaitTag } from '@/components/staff';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, Screen, Section, StatusTag, Tag, Text } from '@/ui';
import { color, onBrandMuted, radius, space } from '@/theme';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const hour = new Date().getHours();
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
function ListRow({ title, subtitle, right, tag, onPress, divider }: { title: string; subtitle: string; right?: React.ReactNode; tag?: React.ReactNode; onPress?: () => void; divider?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.listRow, divider && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="label">{title}</Text>
        {tag}
        <Text role="caption" tone="tertiary">
          {subtitle}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: space[1] }}>{right}</View>
    </Pressable>
  );
}

function CaughtUp() {
  return <EmptyState icon={CircleCheck} tone="success" title="You're all caught up" description="New work appears here as soon as it reaches your stage." />;
}

function Trend({ s }: { s: DashboardSummary }) {
  return (
    <Card>
      <View style={{ gap: space[6] }}>
        {s.collectionsTrend.map((t) => {
          const rate = t.demand ? t.recovered / t.demand : 0;
          return (
            <View key={t.cycle} style={{ gap: space[2] }} accessible accessibilityLabel={`${formatCycle(t.cycle)}: ${pct(rate)} collected`}>
              <View style={styles.between}>
                <Text role="caption" tone="secondary">
                  {formatCycle(t.cycle)}
                </Text>
                <Text role="captionStrong">
                  {formatINRCompact(t.recovered)} / {formatINRCompact(t.demand)} · {pct(rate)}
                </Text>
              </View>
              <Meter rate={rate} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function AdminView({ s }: { s: DashboardSummary }) {
  const delta = s.collectionRate - s.collectionRatePrev;
  const pipelineMax = Math.max(1, ...s.pipeline.map((r) => r.count));
  const inFlight = s.pipeline.reduce((a, r) => a + r.count, 0);
  return (
    <>
      <TileGrid>
        <StatTile label="Active members" value={s.activeMembers.toLocaleString('en-IN')} sub="Contributing this cycle" onPress={() => router.push('/staff/members')} />
        <StatTile label="Loans outstanding" value={formatINRCompact(s.loanOutstanding)} sub={`${s.activeLoans} active loans`} onPress={() => router.push('/staff/loans')} />
        <StatTile label="Deposits held" value={formatINRCompact(s.depositsHeld)} sub="FD, CRD, SRDS, Savings" onPress={() => router.push('/staff/deposits')} />
        <StatTile label={`Collection · ${formatCycle(s.lastPostedCycle)}`} value={pct(s.collectionRate)} sub={`${delta >= 0 ? 'Up' : 'Down'} ${Math.abs(delta * 100).toFixed(1)} pts on previous cycle`} tone={delta >= 0 ? 'success' : 'danger'} />
      </TileGrid>

      <Section title="Needs your attention" right={<Button text="Open queue" subType="inline" onPress={() => router.push('/staff/queue')} />}>
        {s.needsAction.length === 0 ? (
          <CaughtUp />
        ) : (
          <Card padded={false}>
            {s.needsAction.map((item, i) => {
              const waited = Math.max(0, Math.round((Date.parse(`${s.asOf}T00:00:00Z`) - Date.parse(`${item.since}T00:00:00Z`)) / 86_400_000));
              return (
                <ListRow
                  key={item.id}
                  divider={i > 0}
                  title={item.title}
                  subtitle={`${item.ref} · ${item.subtitle}`}
                  tag={item.kind === 'loan' ? <StatusTag entity="loan" status={item.status as LoanStatus} audience="staff" size="xs" /> : <StatusTag entity="membership" status={item.status as MembershipStatus} audience="staff" size="xs" />}
                  right={
                    <>
                      {item.amount !== undefined ? <Text role="label">{formatINR(item.amount)}</Text> : null}
                      <WaitTag days={waited} />
                    </>
                  }
                  onPress={() => router.push(item.kind === 'loan' ? `/staff/loan/${item.id}` : `/staff/joining/${item.id}`)}
                />
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Collections" description="Recovered vs demand, last 6 cycles">
        <Trend s={s} />
      </Section>

      <Section title="Loan pipeline" description={`${inFlight} applications in flight · ${formatINRCompact(s.pipeline.reduce((a, r) => a + r.amount, 0))}`}>
        <Card>
          <View style={{ gap: space[6] }}>
            {s.pipeline.map((row) => (
              <View key={row.status} style={{ gap: space[2] }}>
                <View style={styles.between}>
                  <StatusTag entity="loan" status={row.status as LoanStatus} audience="staff" size="xs" />
                  <Text role="captionStrong">
                    {row.count} · {formatINRCompact(row.amount)}
                  </Text>
                </View>
                <Meter rate={row.count / pipelineMax} />
              </View>
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Short collections" description={`By department · ${formatCycle(s.lastPostedCycle)}`}>
        {s.shortByDepartment.length === 0 ? (
          <Text role="caption" tone="tertiary">
            Every department recovered in full.
          </Text>
        ) : (
          <Card padded={false}>
            {s.shortByDepartment.map((d, i) => (
              <ListRow key={d.departmentId} divider={i > 0} title={d.department} subtitle={`${d.shortMembers} member${d.shortMembers === 1 ? '' : 's'} short`} right={<Text role="label" tone="debit">{formatINR(d.short)}</Text>} />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Retiring in the next 6 months" description={`${s.retiringSoon.count} members · ${formatINRCompact(s.retiringSoon.outstanding)} still outstanding`}>
        {s.retiringSoon.members.length === 0 ? (
          <Text role="caption" tone="tertiary">
            No retirements in the next 6 months.
          </Text>
        ) : (
          <Card padded={false}>
            {s.retiringSoon.members.map((m, i) => {
              const left = Math.max(0, fullMonthsBetween(s.asOf, m.dor));
              return (
                <ListRow
                  key={m.id}
                  divider={i > 0}
                  title={`${m.name} · ${m.generalNo}`}
                  subtitle={`${m.department} · retires ${formatDisplayDate(m.dor)}`}
                  onPress={() => router.push(`/staff/member/${m.id}`)}
                  right={
                    <>
                      <Tag text={left === 0 ? 'This month' : `${left} month${left === 1 ? '' : 's'}`} color={left <= 2 ? 'error' : 'warning'} size="xs" />
                      <Text role="caption" tone="secondary">
                        {m.outstanding > 0 ? formatINR(m.outstanding) : 'No loans'}
                      </Text>
                    </>
                  }
                />
              );
            })}
          </Card>
        )}
      </Section>
    </>
  );
}

function tileValue(t: RoleDashboard['tiles'][number]) {
  if (t.format === 'money') return formatINRCompact(t.value);
  if (t.format === 'percent') return pct(t.value);
  return t.value.toLocaleString('en-IN');
}

function entityTag(entity: string, status?: string) {
  if (!status) return undefined;
  if (entity === 'loan') return <StatusTag entity="loan" status={status as LoanStatus} audience="staff" size="xs" />;
  if (entity === 'membership') return <StatusTag entity="membership" status={status as MembershipStatus} audience="staff" size="xs" />;
  if (entity === 'deposit') return <StatusTag entity="deposit" status={status as DepositStatus} audience="staff" size="xs" />;
  return undefined;
}

function RoleView({ d, summary }: { d: RoleDashboard; summary?: DashboardSummary | undefined }) {
  const total = d.queue.reduce((a, q) => a + q.count, 0);
  const maxQueue = Math.max(1, ...d.queue.map((q) => q.count));
  const DEMAND_LABEL: Record<DemandSheetStatus | 'NOT_GENERATED', string> = { NOT_GENERATED: 'Not generated', GENERATED: 'Generated', CERTIFIED: 'Certified', SENT_TO_DDO: 'Sent to DDO', RECOVERY_POSTED: 'Posted' };
  return (
    <>
      {total > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/staff/queue')} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.92 }]}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="pageTitle" tone="onBrand" style={styles.heroFigure}>
              {total}
            </Text>
            <Text role="label" tone="onBrand">
              waiting on you
            </Text>
            <Text role="caption" style={{ color: onBrandMuted }}>
              {d.oldest[0] ? `Oldest ${d.oldest[0].days} day${d.oldest[0].days === 1 ? '' : 's'}` : ''}
              {d.overTarget ? ` · ${d.overTarget} over the service target` : ''}
            </Text>
          </View>
          <ChevronRight size={24} color={onBrandMuted} />
        </Pressable>
      ) : null}

      <TileGrid>
        {d.tiles.filter((t, i) => !(i === 0 && t.value === total)).map((t) => (
          <StatTile key={t.key} label={t.label} value={tileValue(t)} {...(t.sub ? { sub: t.sub } : {})} {...(t.tone ? { tone: t.tone } : {})} {...(t.link ? { onPress: () => router.push(staffHref(t.link!)) } : {})} />
        ))}
      </TileGrid>

      <Section
        title={d.variant === 'SIGNER' ? 'Awaiting your signature' : d.variant === 'CASHIER' ? 'Waiting on you' : d.variant === 'DDO' ? 'Pending validations' : 'Your queue'}
        description={total ? 'Oldest first' : 'Nothing waiting'}
        right={<Button text="Open queue" subType="inline" onPress={() => router.push('/staff/queue')} />}
      >
        {d.oldest.length === 0 ? (
          <CaughtUp />
        ) : (
          <Card padded={false}>
            {d.oldest.map((i, n) => (
              <ListRow
                key={`${i.kind}-${i.id}`}
                divider={n > 0}
                title={`${i.title} · ${i.stageLabel}`}
                subtitle={`${i.ref} · ${i.subtitle}${i.departmentName && !i.title.startsWith(i.departmentName) ? ` · ${i.departmentName}` : ''}`}
                onPress={() => router.push(staffHref(i.link))}
                right={
                  <>
                    {i.amount ? <Text role="label">{formatINR(i.amount)}</Text> : null}
                    <WaitTag days={i.days} />
                  </>
                }
              />
            ))}
          </Card>
        )}
      </Section>

      <Section title="By stage" description={d.done.count ? `${d.done.label}: ${d.done.count}${d.done.amount ? ` · ${formatINR(d.done.amount)}` : ''}` : `${d.done.label}: none yet`}>
        {d.queue.length === 0 ? (
          <Text role="caption" tone="tertiary">
            No stage has work for you.
          </Text>
        ) : (
          <Card padded={false}>
            {d.queue.map((q, i) => (
              <Pressable key={q.key} accessibilityRole="button" onPress={() => router.push(staffHref(q.link))} style={[styles.stage, i > 0 && styles.divider]}>
                <View style={styles.between}>
                  <Text role="label" style={{ flex: 1 }}>
                    {q.label}
                  </Text>
                  <Text role="captionStrong">
                    {q.count}
                    {q.amount ? ` · ${formatINRCompact(q.amount)}` : ''} · oldest {q.oldestDays}d
                  </Text>
                  <ChevronRight size={16} color={color.text.tertiary} />
                </View>
                <Meter rate={q.count / maxQueue} />
              </Pressable>
            ))}
          </Card>
        )}
      </Section>

      {d.demand ? (
        <Section title={`Demand sheets · ${formatCycle(d.demand.cycle)}`} description={`${formatINR(d.demand.demand)} demand${d.demand.toPost ? ` · ${d.demand.toPost} waiting for recovery` : ''}`} right={<Button text="Open" subType="inline" onPress={() => router.push(`/staff/demand?cycle=${d.demand!.cycle}`)} />}>
          <Card>
            <View style={{ gap: space[4] }}>
              {d.demand.byStatus.map((s) => (
                <View key={s.status} style={styles.between}>
                  {s.status === 'NOT_GENERATED' ? (
                    <Text role="body" tone="secondary">
                      {DEMAND_LABEL[s.status]}
                    </Text>
                  ) : (
                    <StatusTag entity="demandSheet" status={s.status} audience="staff" size="xs" />
                  )}
                  <Text role="amount" tone={s.count ? 'primary' : 'tertiary'}>
                    {s.count}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      <Section title={d.variant === 'CASHIER' ? 'Latest disbursements' : d.variant === 'SIGNER' ? 'Signed recently' : d.variant === 'DDO' ? 'From your department' : 'Latest applications'}>
        {d.recent.length === 0 ? (
          <Text role="caption" tone="tertiary">
            Nothing yet this month.
          </Text>
        ) : (
          <Card padded={false}>
            {d.recent.map((r, i) => (
              <ListRow key={`${r.entity}-${r.id}`} divider={i > 0} title={r.title} tag={entityTag(r.entity, r.status)} subtitle={`${r.ref} · ${r.subtitle} · ${formatDisplayDate(r.at)}`} onPress={() => router.push(staffHref(r.link))} right={r.amount ? <Text role="label">{formatINR(r.amount)}</Text> : undefined} />
            ))}
          </Card>
        )}
      </Section>

      {d.variant === 'DDO' && summary && summary.collectionsTrend.length > 0 ? (
        <Section title="Your department's recovery" description="Recovered vs demand, last 6 cycles">
          <Trend s={summary} />
        </Section>
      ) : null}
    </>
  );
}

export default function StaffHome() {
  const { session } = useAuth();
  const summary = useQuery({ queryKey: ['dashboard-summary', session?.user.id], queryFn: api.dashboard.summary });
  const role = useQuery({ queryKey: ['dashboard-role', session?.user.id], queryFn: api.dashboard.role, refetchInterval: 20_000 });
  const count = useQuery({ queryKey: ['notification-count'], queryFn: api.notifications.count, refetchInterval: 20_000 });
  if (!session) return null;
  const unread = count.data?.unread ?? 0;
  const s = summary.data;
  const waiting = role.data && role.data.variant !== 'ADMIN' ? role.data.queue.reduce((a, q) => a + q.count, 0) : (s?.myQueue ?? 0);
  const refresh = () => void Promise.all([summary.refetch(), role.refetch(), count.refetch()]);

  return (
    <Screen refreshing={summary.isRefetching || role.isRefetching} onRefresh={refresh}>
      <View style={styles.greeting}>
        <AppMark size={40} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text role="pageTitle">
            {session.user.name.split(' ')[0]}
          </Text>
          <Text role="caption" tone="secondary">
            {greeting} · {ROLE_LABELS[session.user.role]}
            {session.user.departmentId ? ' · your department only' : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/staff/search')} style={styles.bell} hitSlop={4}>
          <Search size={20} color={color.text.primary} strokeWidth={1.75} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/staff/account/notifications')} style={styles.bell} hitSlop={4}>
          <Bell size={20} color={color.text.primary} strokeWidth={1.75} />
          {unread ? (
            <View style={styles.badge}>
              <Text role="captionStrong" tone="onBrand" style={{ fontSize: 10, lineHeight: 14 }}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      {s ? (
        <View style={{ gap: space[2] }}>
          <Text role="caption" tone="tertiary">
            Data as of {formatDisplayDate(s.asOf)} · cycle {formatCycle(s.currentCycle)}
            {waiting > 0 && role.data?.variant === 'ADMIN' ? ` · ${waiting} waiting on you` : ''}
          </Text>
        </View>
      ) : null}
      <Loaded q={role} what="your dashboard" height={140}>
        {(d) =>
          d.variant !== 'ADMIN' ? (
            <RoleView d={d} summary={s} />
          ) : (
            <Loaded q={summary} what="your dashboard" height={140}>
              {(sum) => <AdminView s={sum} />}
            </Loaded>
          )
        }
      </Loaded>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[8], borderRadius: radius.card, backgroundColor: color.brand.solid },
  heroFigure: { fontSize: 44, lineHeight: 50, fontVariant: ['tabular-nums'] },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.surface, borderWidth: 1, borderColor: color.border.default },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.status.danger.solid, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[4] },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], paddingHorizontal: space[8], paddingVertical: space[6] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  stage: { gap: space[2], paddingHorizontal: space[8], paddingVertical: space[6] },
});
