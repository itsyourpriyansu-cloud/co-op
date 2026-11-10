// ST-03m One member question: the thread and the reply box.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDateTime } from '@tgs/domain';
import { ActionAlert, Loaded, TICKET_TAG, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, Header, Screen, Tag, Text, TextField } from '@/ui';
import { color, radius, space } from '@/theme';

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
            <Alert type="neutral" heading="Not found" description="This question may have been removed." />
          ) : (
            <>
              <View style={{ gap: space[2] }}>
                <Text role="sectionTitle">{t.subject}</Text>
                <Text role="caption" tone="tertiary">
                  {t.member.name} · General No. {t.member.generalNo} · {t.member.departmentName}
                </Text>
                <Tag text={TICKET_TAG[t.status].text} color={TICKET_TAG[t.status].color} size="xs" />
              </View>
              <View style={{ gap: space[4] }}>
                {(t.messages ?? []).map((m, i) => (
                  <View key={i} style={[styles.bubble, m.from === 'MEMBER' ? styles.them : styles.us]}>
                    <Text role="captionStrong" tone="secondary">
                      {m.from === 'MEMBER' ? t.member.name : m.byName}
                    </Text>
                    <Text role="body">{m.text}</Text>
                    <Text role="caption" tone="tertiary">
                      {formatDisplayDateTime(m.at)}
                    </Text>
                  </View>
                ))}
              </View>
              {sent ? <Alert type="success" heading={sent} description={sent === 'Reply sent' ? `${t.member.name} sees it in the app (Help & support).` : undefined} /> : null}
              <ActionAlert action={a} heading="Could not send" />
              {t.status !== 'CLOSED' ? (
                <View style={{ gap: space[6] }}>
                  <TextField label="Reply" placeholder="Write the answer the member will see in the app" value={text} onChangeText={setText} multiline numberOfLines={3} />
                  <Button text="Send reply" size="lg" fullWidth loading={a.busy} disabled={!text.trim() || a.busy} onPress={() => reply(false)} />
                  <Button text="Close question" buttonType="secondary" fullWidth disabled={a.busy} onPress={() => reply(true)} />
                </View>
              ) : (
                <Text role="caption" tone="tertiary">
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
  bubble: { maxWidth: '88%', gap: space[1], padding: space[6], borderRadius: radius.card },
  them: { alignSelf: 'flex-start', backgroundColor: color.bg.surfaceSunken },
  us: { alignSelf: 'flex-end', backgroundColor: color.brand.subtle },
});
