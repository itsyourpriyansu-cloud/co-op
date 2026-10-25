// ST-03 Notifications (D-063): my in-app notifications (deep links), member questions from MB-13
// (Accountant / Super Admin reply, the member sees it on the phone), and the simulated message
// composer — channel, recipients (member, department, defaulters, retiring), template, preview, send →
// the sent log with "Delivered (simulated)".
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, Mail, MessageCircle, MessageSquareText, Send, UserRound, X } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SnackbarV2Variant, TabsV2, TabsV2List, TabsV2Trigger, TabsV2Variant, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, TextAreaV2, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import type { ComposeInput, ComposePreview, MessageAudience, MessageChannel, MemberPick, StaffTicketRow } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { Chips } from '@/components/Chips';
import { MemberSearch } from '@/components/MemberSearch';
import { PageHeader } from '@/components/PageHeader';
import { SideDrawer } from '@/components/SideDrawer';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const CHANNEL: Record<MessageChannel, { label: string; icon: typeof Mail }> = { SMS: { label: 'SMS', icon: MessageSquareText }, WHATSAPP: { label: 'WhatsApp', icon: MessageCircle }, EMAIL: { label: 'Email', icon: Mail } };
const TICKET_TAG: Record<StaffTicketRow['status'], { text: string; color: TagV2Color }> = { OPEN: { text: 'Waiting for reply', color: TagV2Color.WARNING }, ANSWERED: { text: 'Answered', color: TagV2Color.PRIMARY }, CLOSED: { text: 'Closed', color: TagV2Color.NEUTRAL } };

type Tab = 'mine' | 'questions' | 'sent';

export function NotificationsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs: Array<{ key: Tab; label: string }> = [{ key: 'mine', label: 'For me' }, ...(can('support.reply') ? [{ key: 'questions' as const, label: 'Member questions' }] : []), ...(can('messages.send') ? [{ key: 'sent' as const, label: 'Sent messages' }] : [])];
  const tab = (tabs.find((t) => t.key === params.get('tab'))?.key ?? 'mine') as Tab;
  const count = useQuery({ queryKey: ['notification-count'], queryFn: api.notifications.count, refetchInterval: 20_000 });
  const [composing, setComposing] = useState(false);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What the society system told you, questions from members, and messages sent to members (delivery is simulated)."
        actions={can('messages.send') ? <ButtonV2 text="Send a message" leftSlot={{ slot: <Send size={16} /> }} onClick={() => setComposing(true)} /> : undefined}
      />
      <div className="mb-5">
        <TabsV2 value={tab} onValueChange={(v) => setParams({ tab: v })}>
          <TabsV2List variant={TabsV2Variant.UNDERLINE}>
            {tabs.map((t) => (
              <TabsV2Trigger key={t.key} value={t.key} variant={TabsV2Variant.UNDERLINE}>
                {t.key === 'mine' && count.data?.unread ? `${t.label} (${count.data.unread})` : t.key === 'questions' && count.data?.openQuestions ? `${t.label} (${count.data.openQuestions})` : t.label}
              </TabsV2Trigger>
            ))}
          </TabsV2List>
        </TabsV2>
      </div>
      {tab === 'mine' ? <MyNotifications /> : tab === 'questions' ? <MemberQuestions /> : <SentMessages onCompose={() => setComposing(true)} />}
      {can('messages.send') && <Composer open={composing} onClose={() => setComposing(false)} onSent={() => setParams({ tab: 'sent' })} />}
    </>
  );
}

function MyNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['staff-notifications'], queryFn: api.notifications.list, refetchInterval: 20_000 });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['staff-notifications'] }), qc.invalidateQueries({ queryKey: ['notification-count'] })]);
  const open = async (id: string, read: boolean, link?: string) => {
    if (!read) await api.notifications.read(id).catch(() => undefined);
    void refresh();
    if (link) navigate(link);
  };
  return (
    <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : q.data?.items.length ? 'ready' : 'empty'} layout="cards" onRetry={() => void q.refetch()} empty={{ icon: BellOff, title: 'No notifications', description: 'Updates about your work appear here.' }}>
      {q.data && (
        <section className="rounded-card border border-line bg-surface shadow-raised">
          <header className="flex items-center justify-between border-b border-line-subtle px-5 py-3">
            <span className="text-body text-fg-secondary">{q.data.unread ? `${q.data.unread} unread` : 'All read'}</span>
            {q.data.unread > 0 && <ButtonV2 text="Mark all read" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <CheckCheck size={14} /> }} onClick={() => void api.notifications.readAll().then(refresh)} />}
          </header>
          <ul className="divide-y divide-line-subtle">
            {q.data.items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => void open(n.id, n.read, n.link)} className={cn('grid w-full grid-cols-[36px_1fr_auto] items-start gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle', !n.read && 'bg-brand-subtle/40')}>
                  <span className={cn('flex size-9 items-center justify-center rounded-pill', n.read ? 'bg-surface-subtle text-fg-tertiary' : 'bg-brand-subtle text-brand-text')}>
                    <Bell size={16} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-fg', n.read ? 'text-body' : 'text-label')}>{n.title}</span>
                    <span className="block text-caption text-fg-secondary">{n.body}</span>
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap text-caption text-fg-tertiary">
                    {formatDisplayDateTime(n.createdAt)}
                    {!n.read && <span className="size-2 rounded-pill bg-brand-solid" aria-label="Unread" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ViewState>
  );
}

function MemberQuestions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['staff-tickets'], queryFn: api.notifications.tickets, refetchInterval: 20_000 });
  const [selected, setSelected] = useState<string>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const t = q.data?.find((x) => x.id === selected) ?? q.data?.[0];

  const reply = async (close = false) => {
    if (!t) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.notifications.reply(t.id, text, close);
      setText('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['staff-tickets'] }), qc.invalidateQueries({ queryKey: ['notification-count'] })]);
      addSnackbarV2({ header: close ? 'Question closed' : 'Reply sent', description: close ? undefined : `${t.member.name} sees it in the app (Help & support).`, variant: SnackbarV2Variant.SUCCESS });
    } catch (e) {
      setError(isApiError(e) ? (e.fieldErrors?.text ?? e.message) : 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : q.data?.length ? 'ready' : 'empty'} layout="cards" onRetry={() => void q.refetch()} empty={{ icon: MessageSquareText, title: 'No member questions', description: 'Questions members ask from the app (Help & support) arrive here.' }}>
      {q.data && t && (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <ul className="flex max-h-[640px] flex-col gap-2 overflow-y-auto">
            {q.data.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setSelected(x.id)} className={cn('w-full rounded-card border px-4 py-3 text-left transition-colors', x.id === t.id ? 'border-brand-border bg-brand-subtle' : 'border-line bg-surface hover:bg-surface-subtle')}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-label text-fg">{x.subject}</span>
                    <TagV2 text={TICKET_TAG[x.status].text} color={TICKET_TAG[x.status].color} size={TagV2Size.XS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                  </span>
                  <span className="mt-1 block text-caption text-fg-tertiary">
                    {x.member.name} · {x.member.generalNo} · {formatDisplayDateTime(x.updatedAt ?? x.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className="flex flex-col rounded-card border border-line bg-surface shadow-raised">
            <header className="border-b border-line-subtle px-5 py-4">
              <h2 className="text-card-title text-fg">{t.subject}</h2>
              <p className="text-caption text-fg-tertiary">
                {t.member.name} · General No. {t.member.generalNo} · {t.member.departmentName}
              </p>
            </header>
            <div className="flex flex-1 flex-col gap-3 px-5 py-4">
              {(t.messages ?? []).map((m, i) => (
                <div key={i} className={cn('max-w-[85%] rounded-card px-4 py-3', m.from === 'MEMBER' ? 'self-start bg-surface-subtle' : 'self-end bg-brand-subtle')}>
                  <p className="text-caption-strong text-fg-secondary">{m.from === 'MEMBER' ? t.member.name : m.byName}</p>
                  <p className="whitespace-pre-wrap text-body text-fg">{m.text}</p>
                  <p className="text-caption text-fg-tertiary">{formatDisplayDateTime(m.at)}</p>
                </div>
              ))}
            </div>
            {t.status !== 'CLOSED' ? (
              <footer className="flex flex-col gap-3 border-t border-line-subtle px-5 py-4">
                <TextAreaV2 label="Reply" placeholder="Write the answer the member will see in the app" value={text} onChange={(e) => setText(e.target.value)} rows={3} error={error ? { show: true, message: error } : undefined} />
                <div className="flex justify-end gap-2">
                  <ButtonV2 text="Close question" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <X size={14} /> }} disabled={busy} onClick={() => void reply(true)} />
                  <ButtonV2 text="Send reply" leftSlot={{ slot: <Send size={14} /> }} loading={busy} disabled={!text.trim()} onClick={() => void reply()} />
                </div>
              </footer>
            ) : (
              <footer className="border-t border-line-subtle px-5 py-3 text-caption text-fg-tertiary">This question is closed.</footer>
            )}
          </section>
        </div>
      )}
    </ViewState>
  );
}

function SentMessages({ onCompose }: { onCompose: () => void }) {
  const q = useQuery({ queryKey: ['messages'], queryFn: api.notifications.messages });
  return (
    <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : q.data?.length ? 'ready' : 'empty'} layout="table" onRetry={() => void q.refetch()} empty={{ icon: Send, title: 'No messages sent yet', description: 'Send a dues reminder to defaulters, a notice to a department, or a message to one member.', action: { label: 'Send a message', onClick: onCompose } }}>
      {q.data && (
        <section className="overflow-x-auto rounded-card border border-line bg-surface shadow-raised">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                <th className="px-5 py-3 font-semibold">Sent</th>
                <th className="px-3 py-3 font-semibold">Channel</th>
                <th className="px-3 py-3 font-semibold">To</th>
                <th className="px-3 py-3 font-semibold">Message</th>
                <th className="px-3 py-3 text-right font-semibold">Recipients</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {q.data.map((m) => {
                const C = CHANNEL[m.channel];
                return (
                  <tr key={m.id} className="align-top text-body">
                    <td className="px-5 py-3">
                      <p className="tabular text-fg">{formatDisplayDateTime(m.at)}</p>
                      <p className="text-caption text-fg-tertiary">{m.byName}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-fg-secondary">
                        <C.icon size={14} aria-hidden /> {C.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-fg">{m.audienceLabel}</td>
                    <td className="max-w-md px-3 py-3">
                      <p className="text-label text-fg">{m.title}</p>
                      <p className="line-clamp-2 text-caption text-fg-tertiary">{m.body}</p>
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {m.recipients}
                      {m.skipped ? <span className="block text-caption text-fg-tertiary">{m.skipped} skipped</span> : null}
                    </td>
                    <td className="px-5 py-3">
                      <TagV2 text="Delivered (simulated)" color={TagV2Color.SUCCESS} size={TagV2Size.XS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </ViewState>
  );
}

type AudienceKind = MessageAudience['kind'];

function Composer({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['notification-templates'], queryFn: api.settings.templates, enabled: open });
  const departments = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, enabled: open });
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [kind, setKind] = useState<AudienceKind>('DEFAULTERS');
  const [member, setMember] = useState<MemberPick>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [withinMonths, setWithin] = useState('6');
  const [templateKey, setTemplateKey] = useState<string>();
  const [title, setTitle] = useState('Dues reminder');
  const [body, setBody] = useState('Dear {name} (General No. {generalNo}), {overdue} is unpaid on your society account. Please pay at the counter or by bank transfer and report it in the app.');
  const [preview, setPreview] = useState<ComposePreview>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const memberTemplates = useMemo(() => (templates.data ?? []).filter((t) => t.audience === 'MEMBER'), [templates.data]);
  const audience: MessageAudience | undefined = kind === 'MEMBER' ? (member ? { kind, memberId: member.id } : undefined) : kind === 'DEPARTMENT' ? (departmentId ? { kind, departmentId } : undefined) : kind === 'RETIRING' ? { kind, withinMonths: Number(withinMonths) || 6 } : { kind: 'DEFAULTERS' };
  const input = (): ComposeInput | undefined => (audience ? { channel, audience, title, body, ...(templateKey ? { templateKey } : {}) } : undefined);

  const reset = () => {
    setPreview(undefined);
    setErrors({});
  };
  const doPreview = async () => {
    const i = input();
    if (!i) return setErrors({ audience: kind === 'MEMBER' ? 'Choose a member' : 'Choose a department' });
    setBusy(true);
    setErrors({});
    try {
      setPreview(await api.notifications.preview(i));
    } catch (e) {
      setErrors(isApiError(e) ? (e.fieldErrors ?? { form: e.message }) : { form: 'Could not preview.' });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const i = input();
    if (!i) return;
    setBusy(true);
    try {
      const m = await api.notifications.send(i);
      await qc.invalidateQueries({ queryKey: ['messages'] });
      addSnackbarV2({ header: `${CHANNEL[m.channel].label} sent to ${m.recipients} member${m.recipients === 1 ? '' : 's'}`, description: 'Delivery is simulated. Each member also sees it in the app.', variant: SnackbarV2Variant.SUCCESS });
      reset();
      onClose();
      onSent();
    } catch (e) {
      setErrors(isApiError(e) ? (e.fieldErrors ?? { form: e.message }) : { form: 'Could not send.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="Send a message"
      description="Simulated: nothing leaves the prototype. Members also get it in the app."
      width={640}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-fg-tertiary">{preview ? `${preview.recipients} recipient${preview.recipients === 1 ? '' : 's'}${preview.skipped ? ` · ${preview.skipped} without ${channel === 'EMAIL' ? 'an email' : 'a number'}` : ''}` : 'Preview first to see who gets it'}</span>
          <div className="flex gap-2">
            <ButtonV2 text="Preview" buttonType={ButtonV2Type.SECONDARY} loading={busy && !preview} onClick={() => void doPreview()} />
            <ButtonV2 text="Send" leftSlot={{ slot: <Send size={14} /> }} disabled={!preview || !preview.recipients} loading={busy && !!preview} onClick={() => void send()} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Chips label="Channel" value={channel} options={(Object.keys(CHANNEL) as MessageChannel[]).map((c) => ({ value: c, label: CHANNEL[c].label }))} onChange={(c) => (setChannel(c), reset())} />
        <div className="flex flex-col gap-3">
          <Chips
            label="To"
            value={kind}
            options={[
              { value: 'DEFAULTERS', label: 'All defaulters', hint: 'BR-020' },
              { value: 'DEPARTMENT', label: 'A department' },
              { value: 'RETIRING', label: 'Retiring soon' },
              { value: 'MEMBER', label: 'One member' },
            ]}
            onChange={(k) => (setKind(k), reset())}
          />
          {kind === 'MEMBER' &&
            (member ? (
              <div className="flex items-center justify-between rounded-control border border-line px-3 py-2">
                <span className="flex items-center gap-2 text-body">
                  <UserRound size={16} aria-hidden /> {member.name} · {member.generalNo}
                </span>
                <ButtonV2 text="Change" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} onClick={() => (setMember(undefined), reset())} />
              </div>
            ) : (
              <MemberSearch placeholder="Search by name or General No." onPick={(m) => (setMember(m), reset())} />
            ))}
          {kind === 'DEPARTMENT' && <Chips value={departmentId} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name, hint: `${d.memberCount} members` }))} onChange={(id) => (setDepartmentId(id), reset())} />}
          {kind === 'RETIRING' && <Chips value={withinMonths} options={['3', '6', '12'].map((n) => ({ value: n, label: `Within ${n} months` }))} onChange={(n) => (setWithin(n), reset())} />}
          {errors.audience && <p className="text-caption text-danger-fg">{errors.audience}</p>}
        </div>
        {memberTemplates.length > 0 && (
          <Chips
            label="Start from a template (ST-63)"
            value={templateKey}
            options={memberTemplates.filter((t) => ['dues.reminder', 'defaulter.notice', 'fd.maturing', 'recovery.short'].includes(t.key)).map((t) => ({ value: t.key, label: t.event.replace(/ \(.*\)$/, '') }))}
            onChange={(k) => {
              const t = memberTemplates.find((x) => x.key === k);
              setTemplateKey(k);
              if (t) (setTitle(t.title), setBody(t.body));
              reset();
            }}
          />
        )}
        {channel === 'EMAIL' || channel === 'WHATSAPP' ? <TextInputV2 label={channel === 'EMAIL' ? 'Subject' : 'Title'} value={title} onChange={(e) => (setTitle(e.target.value), reset())} error={errors.title ? { show: true, message: errors.title } : undefined} /> : null}
        <div className="flex flex-col gap-1">
          <TextAreaV2 label="Message" placeholder="Write the message" value={body} onChange={(e) => (setBody(e.target.value), reset())} rows={5} error={errors.body ? { show: true, message: errors.body } : undefined} />
          <p className="text-caption text-fg-tertiary">
            Placeholders: {'{name} {generalNo} {department} {overdue} {cycle} {dor}'}
            {channel === 'SMS' ? ` · ${body.length}/480 characters` : ''}
          </p>
        </div>
        {errors.form && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not sent" description={errors.form} />}
        {preview && (
          <section className="flex flex-col gap-3 rounded-card border border-line bg-surface-subtle p-4">
            <p className="text-label text-fg">
              {preview.audienceLabel} · {preview.recipients} recipient{preview.recipients === 1 ? '' : 's'}
            </p>
            {preview.sample.map((s) => (
              <div key={s.memberId} className="rounded-control border border-line bg-surface px-3 py-2">
                <p className="text-caption text-fg-tertiary">
                  To {s.name} ({s.generalNo}) · {s.to}
                </p>
                {channel !== 'SMS' && <p className="text-label text-fg">{s.title}</p>}
                <p className="text-body text-fg">{s.body}</p>
              </div>
            ))}
            {preview.recipients > preview.sample.length && <p className="text-caption text-fg-tertiary">…and {preview.recipients - preview.sample.length} more.</p>}
          </section>
        )}
      </div>
    </SideDrawer>
  );
}
