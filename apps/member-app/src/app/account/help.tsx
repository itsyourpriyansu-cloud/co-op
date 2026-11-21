// MB-13 Help & support: contact the society office (call / WhatsApp / email / visit), FAQs by topic,
// and "My questions" — tickets with the office's replies; ask a new question (auto-acknowledged).
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Clock, Mail, MapPin, MessageCircle, MessageSquarePlus, Phone, Send, type LucideIcon } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { SupportTicket } from '@tgs/types';
import { api } from '@/lib/api';
import { accountKeys, stamp, useSupport } from '@/lib/account';
import { Banner, Button, Card, EmptyState, Header, Screen, Section, SegmentedControl, SelectField, Skeleton, Token, Text, TextField } from '@/ui';
import { color, radius, touchTarget, spacing } from '@/theme';

type Category = NonNullable<SupportTicket['category']>;
const CATEGORY: Record<Category, string> = { LOAN: 'Loans', DEPOSIT: 'Deposits', PAYMENT: 'Payments', PROFILE: 'Profile', APP: 'The app', OTHER: 'Something else' };
const STATUS: Record<SupportTicket['status'], { text: string; color: 'warning' | 'info' | 'neutral' }> = {
  OPEN: { text: 'Waiting for reply', color: 'warning' },
  ANSWERED: { text: 'Office replied', color: 'info' },
  CLOSED: { text: 'Closed', color: 'neutral' },
};

export default function Help() {
  const q = useSupport();
  const [tab, setTab] = useState<'help' | 'mine'>('help');
  const [asking, setAsking] = useState(false);
  const [topic, setTopic] = useState<string>('All');

  return (
    <Screen header={<Header title="Help & support" onBack={() => (asking ? setAsking(false) : router.back())} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <View style={{ gap: spacing[3] }}>
          <Skeleton height={160} radius={radius.container} />
          <Skeleton height={240} radius={radius.container} />
        </View>
      ) : q.isError || !q.data ? (
        <Banner status="error" heading="Couldn't load help" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : asking ? (
        <AskForm
          onSent={() => {
            setAsking(false);
            setTab('mine');
          }}
        />
      ) : (
        <>
          <SegmentedControl label="Show" hideLabel value={tab} options={[{ value: 'help', label: 'Get help' }, { value: 'mine', label: `My questions (${q.data.tickets.length})` }]} onChange={setTab} />
          {tab === 'help' ? (
            <>
              <Section title="Contact the society office">
                <Card padded={false}>
                  <Contact icon={Phone} label="Call" value={q.data.office.phone} onPress={() => void Linking.openURL(`tel:${q.data!.office.phone.replace(/\s/g, '')}`)} />
                  <Contact icon={MessageCircle} label="WhatsApp" value={q.data.office.whatsapp} onPress={() => void Linking.openURL(`https://wa.me/${q.data!.office.whatsapp.replace(/\D/g, '')}`)} divider />
                  <Contact icon={Mail} label="Email" value={q.data.office.email} onPress={() => void Linking.openURL(`mailto:${q.data!.office.email}`)} divider />
                  <Contact icon={MapPin} label="Visit" value={q.data.office.address} divider />
                  <Contact icon={Clock} label="Office hours" value={q.data.office.hours} divider />
                </Card>
              </Section>
              <Section title="Common questions">
                <View style={styles.chips}>
                  {['All', ...new Set(q.data.faqs.map((f) => f.topic))].map((t) => (
                    <Pressable key={t} accessibilityRole="button" accessibilityState={{ selected: topic === t }} onPress={() => setTopic(t)} style={[styles.chip, topic === t && styles.chipOn]}>
                      <Text type="supporting" weight="medium" style={{ color: topic === t ? color.text.onAccent : color.text.secondary }}>
                        {t}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Card padded={false}>
                  {q.data.faqs
                    .filter((f) => topic === 'All' || f.topic === topic)
                    .map((f, i) => (
                      <Faq key={f.q} q={f.q} a={f.a} divider={i > 0} />
                    ))}
                </Card>
              </Section>
              <Button label="Ask the office a question" icon={MessageSquarePlus} size="lg" fullWidth onPress={() => setAsking(true)} />
            </>
          ) : q.data.tickets.length ? (
            <>
              {q.data.tickets.map((t) => (
                <Ticket key={t.id} t={t} />
              ))}
              <Button label="Ask another question" icon={MessageSquarePlus} variant="secondary" fullWidth onPress={() => setAsking(true)} />
            </>
          ) : (
            <EmptyState icon={MessageSquarePlus} title="No questions yet" description="Ask the office anything about your loans, deposits or payments." action={{ text: 'Ask a question', onPress: () => setAsking(true) }} />
          )}
        </>
      )}
    </Screen>
  );
}

function Contact({ icon: Icon, label, value, onPress, divider }: { icon: LucideIcon; label: string; value: string; onPress?: () => void; divider?: boolean }) {
  const body = (
    <>
      <Icon size={20} color={onPress ? color.accent : color.text.secondary} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: spacing[0.5] }}>
        <Text type="supporting" tone="secondary">
          {label}
        </Text>
        <Text type="body" tone={onPress ? 'link' : 'primary'}>
          {value}
        </Text>
      </View>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.contact, divider && styles.divider, pressed && { backgroundColor: color.background.muted }]}>
      {body}
    </Pressable>
  ) : (
    <View style={[styles.contact, divider && styles.divider]}>{body}</View>
  );
}

function Faq({ q, a, divider }: { q: string; a: string; divider?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={divider && styles.divider}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.faqQ}>
        <Text type="label" style={{ flex: 1 }}>
          {q}
        </Text>
        {open ? <ChevronUp size={18} color={color.text.secondary} /> : <ChevronDown size={18} color={color.text.secondary} />}
      </Pressable>
      {open ? (
        <Text type="body" tone="secondary" style={styles.faqA}>
          {a}
        </Text>
      ) : null}
    </View>
  );
}

function Ticket({ t }: { t: SupportTicket }) {
  const s = STATUS[t.status];
  return (
    <Card>
      <View style={{ gap: spacing[3] }}>
        <View style={styles.ticketHead}>
          <View style={{ flex: 1, gap: spacing[0.5] }}>
            <Text type="h4">{t.subject}</Text>
            <Text type="supporting" tone="secondary">
              {t.category ? `${CATEGORY[t.category]} · ` : ''}
              {stamp(t.createdAt)}
            </Text>
          </View>
          <Token text={s.text} status={s.color} size="xs" />
        </View>
        {(t.messages ?? []).map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === 'MEMBER' ? styles.mine : styles.theirs]}>
            <Text type="supporting" weight="medium" tone={m.from === 'MEMBER' ? 'link' : 'secondary'}>
              {m.from === 'MEMBER' ? 'You' : m.byName}
            </Text>
            <Text type="body">{m.text}</Text>
            <Text type="supporting" tone="secondary">
              {stamp(m.at)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function AskForm({ onSent }: { onSent: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>('LOAN');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.account.createTicket({ subject, message, category });
      await qc.invalidateQueries({ queryKey: accountKeys.support });
      onSent();
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      if (isApiError(e) && e.fieldErrors) setErrors(e.fieldErrors);
      else setErrors({ form: isApiError(e) ? e.message : 'Could not send.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Text type="body" tone="secondary">
        The office replies here within two working days. For anything urgent, call the office.
      </Text>
      <SelectField label="About" value={category} options={(Object.keys(CATEGORY) as Category[]).map((k) => ({ value: k, label: CATEGORY[k] }))} onChange={(v) => setCategory(v as Category)} />
      <TextField label="Subject" value={subject} onChangeText={setSubject} error={errors.subject} placeholder="e.g. Interest certificate for FD" required />
      <TextField label="Your question" value={message} onChangeText={setMessage} error={errors.message} multiline numberOfLines={5} textAlignVertical="top" required />
      {errors.form ? <Banner status="error" heading="Not sent" description={errors.form} /> : null}
      <Button label="Send question" icon={Send} size="lg" fullWidth loading={busy} disabled={!subject.trim() || !message.trim()} onPress={() => void send()} />
    </>
  );
}

const styles = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: touchTarget + 12, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  chip: { paddingHorizontal: spacing[3], minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: color.border, backgroundColor: color.background.surface },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  faqQ: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: touchTarget + 8, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  faqA: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  ticketHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  bubble: { gap: spacing[0.5], padding: spacing[3], borderRadius: radius.container, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.accentMuted },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.background.muted },
});
