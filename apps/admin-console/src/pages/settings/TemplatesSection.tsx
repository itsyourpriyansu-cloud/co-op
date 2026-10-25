// ST-63 Notification templates & channels. Sending is simulated: in-app always, SMS / WhatsApp /
// email are shown as "sent via" on each notification.
import { useState } from 'react';
import { BellRing, Mail, MessageCircle, Pencil, Smartphone, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2Type, Checkbox, CheckboxSize, TextAreaV2 } from '@juspay/blend-design-system';
import type { NotificationChannel, NotificationTemplate } from '@tgs/types';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { useSettingsSave } from './shared';

const CHANNELS: Array<{ id: NotificationChannel; label: string; icon: LucideIcon }> = [
  { id: 'IN_APP', label: 'App', icon: BellRing },
  { id: 'SMS', label: 'SMS', icon: Smartphone },
  { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle },
  { id: 'EMAIL', label: 'Email', icon: Mail },
];

const SAMPLE: Record<string, string> = {
  name: 'Lakshmi',
  applicationNo: 'APP-2026-00123',
  stage: 'Department verification',
  generalNo: '1606',
  product: 'Ordinary Loan',
  amount: '₹2,00,000',
  borrower: 'Mahesh Babu P',
  reason: 'Pay slip for the latest month is missing.',
  emi: '₹5,167',
  firstCycle: 'Nov 2026',
  netAmount: '₹1,80,000',
  loanNo: 'LN-2026-00412',
  fdrNo: 'FDR-2026-00151',
  maturityDate: '24 Oct 2028',
  cycle: 'Oct 2026',
  recovered: '₹2,000',
  demand: '₹5,000',
  reference: 'UTR123456789',
  receiptNo: 'RCP-C-000101',
  department: 'Finance',
  members: '48',
};
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => SAMPLE[k] ?? `{${k}}`);
const vars = (t: NotificationTemplate) => [...new Set([...`${t.title} ${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];

export function TemplatesSection({ canEdit }: { canEdit: boolean }) {
  const q = useQuery({ queryKey: ['templates'], queryFn: api.settings.templates });
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const save = useSettingsSave((t: NotificationTemplate) => api.settings.updateTemplate(t.key, t), 'Template saved');
  const errors = fieldErrorsOf(save.error);
  const audienceLabel = { MEMBER: 'Members', APPLICANT: 'Applicants', STAFF: 'Staff' } as const;

  return (
    <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="cards" onRetry={() => void q.refetch()}>
      <ul className="flex flex-col divide-y divide-line-subtle rounded-card border border-line bg-surface shadow-raised">
        {(q.data ?? []).map((t) => (
          <li key={t.key} className="flex flex-wrap items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-label text-fg">{t.event}</p>
                <span className="text-caption text-fg-tertiary">· {audienceLabel[t.audience]}</span>
              </div>
              <p className="mt-1 text-caption text-fg-secondary">
                <span className="text-caption-strong text-fg">{fill(t.title)}</span> — {fill(t.body)}
              </p>
            </div>
            <div className="flex items-center gap-1.5" aria-label="Channels">
              {CHANNELS.map((c) => (
                <span key={c.id} title={c.label} className={`flex size-7 items-center justify-center rounded-pill ${t.channels.includes(c.id) ? 'bg-brand-subtle text-brand-text' : 'bg-surface-muted text-fg-disabled'}`}>
                  <c.icon size={14} aria-hidden />
                  <span className="sr-only">{`${c.label}: ${t.channels.includes(c.id) ? 'on' : 'off'}`}</span>
                </span>
              ))}
            </div>
            {canEdit && <ButtonV2 text="Edit" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Pencil size={14} /> }} onClick={() => setEditing(t)} />}
          </li>
        ))}
      </ul>
      <SideDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.event ?? ''}
        description="Use the placeholders listed. They are filled in when the message is sent."
        footer={
          <div className="flex justify-end gap-2">
            <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={() => setEditing(null)} />
            <ButtonV2 text="Save template" loading={save.isPending} onClick={() => editing && save.mutate(editing, { onSuccess: () => setEditing(null) })} />
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-5">
            <TextField label="Title" name="title" value={editing.title} onChange={(title) => setEditing({ ...editing, title })} errors={errors} />
            <TextAreaV2 label="Message" placeholder="Message text" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} error={errors.body ? { show: true, message: errors.body } : undefined} />
            <div className="flex flex-wrap gap-1.5">
              {vars(q.data?.find((t) => t.key === editing.key) ?? editing).map((v) => (
                <button key={v} type="button" className="rounded-pill bg-surface-muted px-2.5 py-1 font-mono text-caption text-fg-secondary hover:bg-surface-sunken" onClick={() => setEditing({ ...editing, body: `${editing.body} {${v}}` })}>
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <section className="flex flex-col gap-2">
              <p className="text-label text-fg">Send by</p>
              {CHANNELS.map((c) => (
                <Checkbox key={c.id} checked={editing.channels.includes(c.id)} onCheckedChange={(on) => setEditing({ ...editing, channels: on === true ? [...editing.channels, c.id] : editing.channels.filter((x) => x !== c.id) })} size={CheckboxSize.MEDIUM}>
                  {c.label}
                </Checkbox>
              ))}
              {errors.channels && <p className="text-caption text-danger-fg">{errors.channels}</p>}
            </section>
            <section className="rounded-card border border-line bg-surface-subtle px-4 py-3">
              <p className="text-overline uppercase tracking-wide text-fg-tertiary">Preview</p>
              <p className="mt-1 text-label text-fg">{fill(editing.title)}</p>
              <p className="text-body text-fg-secondary">{fill(editing.body)}</p>
            </section>
          </div>
        )}
      </SideDrawer>
    </ViewState>
  );
}
