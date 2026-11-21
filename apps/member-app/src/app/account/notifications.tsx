// MB-12 Notifications: newest first, unread marked, tap opens the screen it is about and marks it
// read; "Mark all read". Each row says where else it was (simulated) sent, from MB-14 preferences.
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, ChevronRight, Settings } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { accountKeys, appRouteFor, stamp, useNotifications } from '@/lib/account';
import { Banner, Button, Card, EmptyState, Header, Screen, Skeleton, Text } from '@/ui';
import { color, radius, spacing } from '@/theme';

const VIA: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'Email' };

export default function Notifications() {
  const qc = useQueryClient();
  const q = useNotifications();
  const isMember = useAuth().session?.user.role === 'MEMBER';
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: accountKeys.notifications }), qc.invalidateQueries({ queryKey: accountKeys.home })]);
  const open = async (id: string, read: boolean, link?: string) => {
    if (!read) await api.account.readNotification(id).catch(() => undefined);
    void refresh();
    const to = appRouteFor(link);
    if (to) router.push(to as Href);
  };
  const readAll = async () => {
    await api.account.readAllNotifications();
    await refresh();
  };

  return (
    <Screen
      header={
        <Header
          title="Notifications"
          onBack={() => router.back()}
          right={
            isMember ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Notification settings" hitSlop={8} onPress={() => router.push('/account/settings')} style={styles.headerBtn}>
                <Settings size={22} color={color.text.primary} strokeWidth={1.75} />
              </Pressable>
            ) : undefined
          }
        />
      }
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
    >
      {q.isLoading ? (
        <View style={{ gap: spacing[2] }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={72} radius={radius.container} />
          ))}
        </View>
      ) : q.isError || !q.data ? (
        <Banner status="error" heading="Couldn't load notifications" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : !q.data.items.length ? (
        <EmptyState icon={BellOff} title="No notifications yet" description="Loan, deposit and payment updates from the society appear here." />
      ) : (
        <>
          <View style={styles.bar}>
            <Text type="body" tone="secondary" style={{ flex: 1 }}>
              {q.data.unread ? `${q.data.unread} unread` : 'All read'}
            </Text>
            {q.data.unread ? <Button label="Mark all read" icon={CheckCheck} variant="secondary" size="sm" onPress={() => void readAll()} /> : null}
          </View>
          <Card padded={false}>
            {q.data.items.map((n, i) => {
              const linked = Boolean(appRouteFor(n.link));
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  onPress={() => void open(n.id, n.read, n.link)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.divider, !n.read && { backgroundColor: color.accentMuted }, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.icon, { backgroundColor: n.read ? color.background.muted : color.background.surface }]}>
                    <Bell size={18} color={n.read ? color.text.secondary : color.accent} />
                  </View>
                  <View style={{ flex: 1, gap: spacing[0.5] }}>
                    <View style={styles.titleRow}>
                      <Text type={n.read ? 'body' : 'label'} style={{ flex: 1 }}>
                        {n.title}
                      </Text>
                      {!n.read ? <View style={styles.dot} /> : null}
                    </View>
                    <Text type="supporting" tone="secondary">
                      {n.body}
                    </Text>
                    <Text type="supporting" tone="secondary">
                      {stamp(n.createdAt)}
                      {n.alsoSentVia?.length ? ` · also by ${n.alsoSentVia.map((v) => VIA[v]).join(', ')}` : ''}
                    </Text>
                  </View>
                  {linked ? <ChevronRight size={18} color={color.text.secondary} /> : null}
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], padding: spacing[4] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
});
