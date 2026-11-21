// ST-03m One member question: the thread and the reply box.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDateTime } from '@tgs/domain';
import { ActionAlert, Loaded, TICKET_TAG, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Banner, Button, Header, Screen, Token, Text, TextField } from '@/ui';
import { color, radius, spacing } from '@/theme';

export default function Question() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['staff-tickets'], queryFn: api.notifications.tickets, refetchInterval: 20_000 });
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string>();
  const a = useAction();
  const t = q.data?.find((x) => x.id === id);
  const reply = (close: boolean) => void a.run(() => api.notifications.reply(id, text, close), () => (setText(''), setSent(close ? 'Question closed' : 'Reply sent')));

  return (
    <Screen header={<Header title="Member question" onBack={() => router.back()} />}>
      <Loaded q={q} what="this question">
        {() =>
          !t ? (
            <Banner status="neutral" heading="Not found" description="This question may have been removed." />
          ) : (
            <>
              <View style={{ gap: spacing[1] }}>
                <Text type="h3">{t.subject}</Text>
                <Text type="supporting" tone="secondary">
                  {t.member.name} · General No. {t.member.generalNo} · {t.member.departmentName}
                </Text>
                <Token text={TICKET_TAG[t.status].text} status={TICKET_TAG[t.status].color} size="xs" />
              </View>
              <View style={{ gap: spacing[2] }}>
                {(t.messages ?? []).map((m, i) => (
                  <View key={i} style={[styles.bubble, m.from === 'MEMBER' ? styles.them : styles.us]}>
                    <Text type="supporting" weight="medium" tone="secondary">
                      {m.from === 'MEMBER' ? t.member.name : m.byName}
                    </Text>
                    <Text type="body">{m.text}</Text>
                    <Text type="supporting" tone="secondary">
                      {formatDisplayDateTime(m.at)}
                    </Text>
                  </View>
                ))}
              </View>
              {sent ? <Banner status="success" heading={sent} description={sent === 'Reply sent' ? `${t.member.name} sees it in the app (Help & support).` : undefined} /> : null}
              <ActionAlert action={a} heading="Could not send" />
              {t.status !== 'CLOSED' ? (
                <View style={{ gap: spacing[3] }}>
                  <TextField label="Reply" placeholder="Write the answer the member will see in the app" value={text} onChangeText={setText} multiline numberOfLines={3} />
                  <Button label="Send reply" size="lg" fullWidth loading={a.busy} disabled={!text.trim() || a.busy} onPress={() => reply(false)} />
                  <Button label="Close question" variant="secondary" fullWidth disabled={a.busy} onPress={() => reply(true)} />
                </View>
              ) : (
                <Text type="supporting" tone="secondary">
                  This question is closed.
                </Text>
              )}
            </>
          )
        }
      </Loaded>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '88%', gap: spacing[0.5], padding: spacing[3], borderRadius: radius.container },
  them: { alignSelf: 'flex-start', backgroundColor: color.background.muted },
  us: { alignSelf: 'flex-end', backgroundColor: color.accentMuted },
});
