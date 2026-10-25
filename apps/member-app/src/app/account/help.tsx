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
import { Alert, Button, Card, EmptyState, Header, Screen, Section, Segmented, SelectField, Skeleton, Tag, Text, TextField } from '@/ui';
import { color, radius, space, touchTarget } from '@/theme';

type Category = NonNullable<SupportTicket['category']>;
const CATEGORY: Record<Category, string> = { LOAN: 'Loans', DEPOSIT: 'Deposits', PAYMENT: 'Payments', PROFILE: 'Profile', APP: 'The app', OTHER: 'Something else' };
const STATUS: Record<SupportTicket['status'], { text: string; color: 'warning' | 'primary' | 'neutral' }> = {
  OPEN: { text: 'Waiting for reply', color: 'warning' },
  ANSWERED: { text: 'Office replied', color: 'primary' },
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
        <View style={{ gap: space[6] }}>
          <Skeleton height={160} radius={radius.card} />
          <Skeleton height={240} radius={radius.card} />
        </View>
      ) : q.isError || !q.data ? (
        <Alert type="error" heading="Couldn't load help" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : asking ? (
        <AskForm
          onSent={() => {
            setAsking(false);
            setTab('mine');
          }}
        />
      ) : (
        <>
          <Segmented label="Show" value={tab} options={[{ value: 'help', label: 'Get help' }, { value: 'mine', label: `My questions (${q.data.tickets.length})` }]} onChange={setTab} />
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
                      <Text role="captionStrong" style={{ color: topic === t ? color.text.onBrand : color.text.secondary }}>
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
              <Button text="Ask the office a question" leftSlot={MessageSquarePlus} size="lg" fullWidth onPress={() => setAsking(true)} />
            </>
          ) : q.data.tickets.length ? (
            <>
              {q.data.tickets.map((t) => (
                <Ticket key={t.id} t={t} />
              ))}
              <Button text="Ask another question" leftSlot={MessageSquarePlus} buttonType="secondary" fullWidth onPress={() => setAsking(true)} />
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
      <Icon size={20} color={onPress ? color.brand.solid : color.text.secondary} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text role="caption" tone="secondary">
          {label}
        </Text>
        <Text role="body" tone={onPress ? 'link' : 'primary'}>
          {value}
        </Text>
      </View>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.contact, divider && styles.divider, pressed && { backgroundColor: color.bg.surfaceSubtle }]}>
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
        <Text role="label" style={{ flex: 1 }}>
          {q}
        </Text>
        {open ? <ChevronUp size={18} color={color.text.tertiary} /> : <ChevronDown size={18} color={color.text.tertiary} />}
      </Pressable>
      {open ? (
        <Text role="body" tone="secondary" style={styles.faqA}>
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
      <View style={{ gap: space[6] }}>
        <View style={styles.ticketHead}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text role="cardTitle">{t.subject}</Text>
            <Text role="caption" tone="tertiary">
              {t.category ? `${CATEGORY[t.category]} · ` : ''}
              {stamp(t.createdAt)}
            </Text>
          </View>
          <Tag text={s.text} color={s.color} size="xs" />
        </View>
        {(t.messages ?? []).map((m, i) => (
          <View key={i} style={[styles.bubble, m.from === 'MEMBER' ? styles.mine : styles.theirs]}>
            <Text role="captionStrong" tone={m.from === 'MEMBER' ? 'link' : 'secondary'}>
              {m.from === 'MEMBER' ? 'You' : m.byName}
            </Text>
            <Text role="body">{m.text}</Text>
            <Text role="caption" tone="tertiary">
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
      <Text role="body" tone="secondary">
        The office replies here within two working days. For anything urgent, call the office.
      </Text>
      <SelectField label="About" value={category} options={(Object.keys(CATEGORY) as Category[]).map((k) => ({ value: k, label: CATEGORY[k] }))} onChange={(v) => setCategory(v as Category)} />
      <TextField label="Subject" value={subject} onChangeText={setSubject} error={errors.subject} placeholder="e.g. Interest certificate for FD" required />
      <TextField label="Your question" value={message} onChangeText={setMessage} error={errors.message} multiline numberOfLines={5} textAlignVertical="top" required />
      {errors.form ? <Alert type="error" heading="Not sent" description={errors.form} /> : null}
      <Button text="Send question" leftSlot={Send} size="lg" fullWidth loading={busy} disabled={!subject.trim() || !message.trim()} onPress={() => void send()} />
    </>
  );
}

const styles = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', gap: space[6], minHeight: touchTarget + 12, paddingHorizontal: space[8], paddingVertical: space[4] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  chip: { paddingHorizontal: space[6], minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: color.border.default, backgroundColor: color.bg.surface },
  chipOn: { backgroundColor: color.brand.solid, borderColor: color.brand.solid },
  faqQ: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: touchTarget + 8, paddingHorizontal: space[8], paddingVertical: space[4] },
  faqA: { paddingHorizontal: space[8], paddingBottom: space[8] },
  ticketHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4] },
  bubble: { gap: space[1], padding: space[6], borderRadius: radius.card, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.brand.subtle },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.bg.surfaceSubtle },
});
