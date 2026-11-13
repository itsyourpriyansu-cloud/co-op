// ST-03m Notifications: what the system told me, member questions, sent messages (with what each provider did, G5;
// outbox progress and failed sends to retry, G9 D-121).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, MessageSquareText, RotateCw, Send } from 'lucide-react-native';
import { formatDisplayDateTime } from '@tgs/domain';
import type { OutboxMessage } from '@tgs/types';
import {
  ActionAlert,
  Filter,
  Loaded,
  RecordCard,
  Stack2,
  staffHref,
  TICKET_TAG,
  useAction,
  useCan,
} from '@/components/staff';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Header, Screen, Tag, Text } from '@/ui';
import { color, space } from '@/theme';

type Tab = 'mine' | 'questions' | 'sent';

/** G9 (D-121): what the outbox and the provider did with a composed message. */
function messageStatus(m: OutboxMessage): {
  text: string;
  color: 'neutral' | 'primary' | 'success' | 'warning';
} {
  if (m.status === 'QUEUED')
    return m.scheduledFor
      ? { text: `Goes out ${formatDisplayDateTime(m.scheduledFor)}`, color: 'neutral' }
      : { text: 'Sending…', color: 'primary' };
  if (m.status === 'DELIVERED_SIMULATED')
    return { text: 'Delivered (simulated)', color: 'success' };
  return m.failed
    ? { text: `${m.failed} not delivered`, color: 'warning' }
    : { text: 'Sent', color: 'success' };
}

export default function Notifications() {
  const can = useCan();
  const [tab, setTab] = useState<Tab>('mine');
  const count = useQuery({
    queryKey: ['notification-count'],
    queryFn: api.notifications.count,
    refetchInterval: 20_000,
  });
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'mine', label: `For me${count.data?.unread ? ` ${count.data.unread}` : ''}` },
    ...(can('support.reply')
      ? [
          {
            value: 'questions' as const,
            label: `Questions${count.data?.openQuestions ? ` ${count.data.openQuestions}` : ''}`,
          },
        ]
      : []),
    ...(can('messages.send') ? [{ value: 'sent' as const, label: 'Sent' }] : []),
  ];
  return (
    <Screen
      header={<Header title="Notifications" onBack={() => router.back()} />}
      {...(can('messages.send')
        ? {
            footer: (
              <Button
                text="Send a message"
                leftSlot={Send}
                size="lg"
                fullWidth
                onPress={() => router.push('/staff/account/compose')}
              />
            ),
          }
        : {})}
    >
      {tabs.length > 1 ? <Filter value={tab} options={tabs} onChange={setTab} /> : null}
      {tab === 'mine' ? <Mine /> : tab === 'questions' ? <Questions /> : <Sent />}
    </Screen>
  );
}

function Mine() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['staff-notifications'],
    queryFn: api.notifications.list,
    refetchInterval: 20_000,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['staff-notifications'] }),
      qc.invalidateQueries({ queryKey: ['notification-count'] }),
    ]);
  const open = async (id: string, read: boolean, link?: string) => {
    if (!read) await api.notifications.read(id).catch(() => undefined);
    void refresh();
    if (link) router.push(staffHref(link));
  };
  return (
    <Loaded q={q} what="your notifications">
      {(d) =>
        d.items.length ? (
          <View style={{ gap: space[6] }}>
            <View style={styles.between}>
              <Text role="caption" tone="secondary">
                {d.unread ? `${d.unread} unread` : 'All read'}
              </Text>
              {d.unread > 0 ? (
                <Button
                  text="Mark all read"
                  subType="inline"
                  onPress={() => void api.notifications.readAll().then(refresh)}
                />
              ) : null}
            </View>
            <Card padded={false}>
              {d.items.map((n, i) => (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  onPress={() => void open(n.id, n.read, n.link)}
                  style={({ pressed }) => [
                    styles.note,
                    i > 0 && styles.divider,
                    !n.read && { backgroundColor: color.brand.subtle },
                    pressed && { backgroundColor: color.bg.surfaceSubtle },
                  ]}
                >
                  <Bell size={18} color={n.read ? color.text.tertiary : color.brand.solid} />
                  <View style={{ flex: 1, gap: space[1] }}>
                    <Text role="label" tone={n.read ? 'secondary' : 'primary'}>
                      {n.title}
                    </Text>
                    <Text role="caption" tone="secondary">
                      {n.body}
                    </Text>
                    <Text role="caption" tone="tertiary">
                      {formatDisplayDateTime(n.createdAt)}
                      {n.read ? '' : ' · Unread'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          </View>
        ) : (
          <EmptyState
            icon={BellOff}
            title="No notifications"
            description="Updates about your work appear here."
          />
        )
      }
    </Loaded>
  );
}

function Questions() {
  const q = useQuery({
    queryKey: ['staff-tickets'],
    queryFn: api.notifications.tickets,
    refetchInterval: 20_000,
  });
  return (
    <Loaded q={q} what="member questions">
      {(rows) =>
        rows.length ? (
          <Stack2>
            {rows.map((x) => (
              <RecordCard
                key={x.id}
                title={x.subject}
                subtitle={`${x.member.name} · ${x.member.generalNo}`}
                tag={
                  <Tag
                    text={TICKET_TAG[x.status].text}
                    color={TICKET_TAG[x.status].color}
                    size="xs"
                  />
                }
                caption={formatDisplayDateTime(x.updatedAt ?? x.createdAt)}
                onPress={() => router.push(`/staff/account/question/${x.id}`)}
              />
            ))}
          </Stack2>
        ) : (
          <EmptyState
            icon={MessageSquareText}
            title="No member questions"
            description="Questions members ask from the app (Help & support) arrive here."
          />
        )
      }
    </Loaded>
  );
}

function Sent() {
  const q = useQuery({
    queryKey: ['messages'],
    queryFn: api.notifications.messages,
    refetchInterval: (query) =>
      query.state.data?.some((m) => m.status === 'QUEUED' && !m.scheduledFor) ? 3_000 : false,
  });
  return (
    <>
      <FailedSends />
      <Loaded q={q} what="sent messages">
        {(rows) =>
          rows.length ? (
            <Stack2>
              {rows.map((m) => (
                <RecordCard
                  key={m.id}
                  title={m.title}
                  subtitle={`${m.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} · ${m.audienceLabel}`}
                  tag={
                    <Tag text={messageStatus(m).text} color={messageStatus(m).color} size="xs" />
                  }
                  caption={`${m.body}\n${formatDisplayDateTime(m.at)} · ${m.byName} · ${m.recipients} recipient${m.recipients === 1 ? '' : 's'}${m.skipped ? `, ${m.skipped} skipped` : ''}${m.progress?.DELIVERED || m.progress?.READ ? ` · ${(m.progress.DELIVERED ?? 0) + (m.progress.READ ?? 0)} delivered, ${m.progress.READ ?? 0} read` : ''}`}
                />
              ))}
            </Stack2>
          ) : (
            <EmptyState
              icon={Send}
              title="No messages sent yet"
              description="Send a dues reminder to defaulters, a notice to a department, or a message to one member."
            />
          )
        }
      </Loaded>
    </>
  );
}

/** G9 (D-121): sends that failed after their retries; the office checks the number and sends again. */
function FailedSends() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['failed-deliveries'], queryFn: api.notifications.failed });
  const a = useAction();
  const retry = (id: string) =>
    a.run(async () => {
      await api.notifications.retry(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['failed-deliveries'] }),
        qc.invalidateQueries({ queryKey: ['messages'] }),
      ]);
    });
  if (!q.data?.length) return null;
  return (
    <View style={{ gap: space[6], marginBottom: space[8] }}>
      <Text role="label">Not delivered ({q.data.length})</Text>
      <Text role="caption" tone="tertiary">
        Retried for about 40 minutes, or refused by WhatsApp / email. Check the member's number or
        email, then send again.
      </Text>
      <ActionAlert action={a} />
      {q.data.map((f) => (
        <RecordCard
          key={f.id}
          title={f.member ? `${f.member.name} (${f.member.generalNo})` : 'Unknown recipient'}
          subtitle={`${f.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} ${f.to}`}
          caption={`${f.title}\n${f.error} · ${formatDisplayDateTime(f.at)}`}
        >
          <Button
            text="Send again"
            leftSlot={RotateCw}
            buttonType="secondary"
            size="sm"
            loading={a.busy}
            disabled={a.busy}
            onPress={() => void retry(f.id)}
          />
        </RecordCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  note: {
    flexDirection: 'row',
    gap: space[6],
    paddingHorizontal: space[8],
    paddingVertical: space[6],
  },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
