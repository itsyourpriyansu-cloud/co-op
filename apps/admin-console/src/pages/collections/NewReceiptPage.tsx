// ST-45 New receipt at the counter: member → what they owe (dues by month and head, first-demand
// shares) → purpose and mode (cash with the denomination counter, BR-029 · bank transfer · Accountant
// adjustment) → live allocation (oldest month first, BR-011) → Save → ST-46.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, X } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, TextAreaV2, TextInputV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { allocateArrears, amountInWords, formatINR } from '@tgs/domain';
import type { MemberPick, NewReceiptInput } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { DenominationCounter, type Counts } from '@/components/DenominationCounter';
import { FormSection, MoneyField, TextField, fieldErrorsOf } from '@/components/Form';
import { MemberSearch } from '@/components/MemberSearch';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { cycleLabel } from './collections';

function Chips<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; hint?: string; disabled?: boolean }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn('rounded-control border px-4 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', value === o.value ? 'border-brand-border bg-brand-subtle text-brand-text' : 'border-line bg-surface text-fg-secondary hover:bg-surface-subtle')}
        >
          <span className="block text-label">{o.label}</span>
          {o.hint && <span className="block text-caption text-fg-tertiary">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function NewReceiptPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [member, setMember] = useState<MemberPick | null>(null);
  const dues = useQuery({ queryKey: ['dues', member?.id], queryFn: () => api.receipts.dues(member!.id), enabled: Boolean(member) });
  const [purpose, setPurpose] = useState<NewReceiptInput['purpose']>('DUES');
  const [mode, setMode] = useState<NewReceiptInput['mode']>('CASH');
  const [amount, setAmount] = useState<number>(Number.NaN);
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [date, setDate] = useState('2026-10-24');
  const owed = dues.data ? (purpose === 'DUES' ? dues.data.totalArrears : dues.data.shareCapitalDue) : 0;
  const amt = Number.isFinite(amount) ? amount : owed;

  const preview = useMemo(() => {
    if (!dues.data || purpose !== 'DUES' || !(amt > 0)) return [];
    const r = allocateArrears(dues.data.arrears.map((a) => ({ key: a.cycle, components: a.components })), amt);
    return r.cycles.flatMap((c, i) => c.components.map((x, j) => ({ cycle: c.key, label: dues.data!.arrears[i]!.components[j]!.label, loanNo: dues.data!.arrears[i]!.components[j]!.loanNo, delta: x.allocated - dues.data!.arrears[i]!.components[j]!.allocated }))).filter((x) => x.delta > 0);
  }, [dues.data, purpose, amt]);

  const save = useMutation({
    mutationFn: () => api.receipts.create({ memberId: member!.id, purpose, mode, amount: amt, date, ...(mode === 'CASH' ? { denominations: counts } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }),
    onSuccess: (r) => navigate(`/payments/${r.receipt.id}`),
  });
  const errors = fieldErrorsOf(save.error);

  return (
    <>
      <ButtonV2 text="Payments" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/payments')} />
      <div className="mt-3">
        <PageHeader title="New receipt" description="Take a member's payment at the counter or record a bank credit. Dues settle the oldest month first, in the agreement's order (BR-011)." />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">
          <FormSection title="Member" columns={1}>
            {member ? (
              <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-subtle px-4 py-3">
                <div>
                  <p className="text-label text-fg">{member.name}</p>
                  <p className="text-caption text-fg-secondary">
                    No. {member.generalNo} · {member.designation} · {member.departmentName}
                  </p>
                </div>
                <ButtonV2 subType={ButtonV2SubType.ICON_ONLY} buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <X size={14} /> }} aria-label="Change member" onClick={() => { setMember(null); setAmount(Number.NaN); }} />
              </div>
            ) : (
              <MemberSearch placeholder="Search by name or General No." onPick={(m) => { setMember(m); setAmount(Number.NaN); }} />
            )}
            {errors.memberId && <p className="text-caption text-danger-fg">{errors.memberId}</p>}
          </FormSection>

          {member && dues.data && (
            <>
              <FormSection title="Payment" columns={1}>
                <div className="flex flex-col gap-2">
                  <p className="text-label text-fg">For</p>
                  <Chips
                    value={purpose}
                    onChange={(p) => { setPurpose(p); setAmount(Number.NaN); }}
                    options={[
                      { value: 'DUES', label: 'Dues', hint: dues.data.totalArrears ? `${formatINR(dues.data.totalArrears)} unpaid` : 'Nothing unpaid', disabled: !dues.data.totalArrears },
                      { value: 'SHARE_CAPITAL', label: 'Share capital', hint: dues.data.shareCapitalDue ? `${formatINR(dues.data.shareCapitalDue)} due` : 'Fully paid', disabled: !dues.data.shareCapitalDue },
                    ]}
                  />
                  {errors.purpose && <p className="text-caption text-danger-fg">{errors.purpose}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-label text-fg">Received as</p>
                  <Chips
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'CASH', label: 'Cash', hint: 'Count the notes' },
                      { value: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'UTR / reference' },
                      { value: 'ADJUSTMENT', label: 'Adjustment', hint: 'Accountant only', disabled: session?.user.role !== 'ACCOUNTANT' },
                    ]}
                  />
                  {errors.mode && <p className="text-caption text-danger-fg">{errors.mode}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyField label="Amount" name="amount" value={amt} onChange={setAmount} errors={errors} hint={amt > 0 ? amountInWords(amt) : undefined} required />
                  <TextInputV2 label="Date received" type="date" value={date} max="2026-10-24" onChange={(e) => setDate(e.target.value)} error={errors.date ? { show: true, message: errors.date } : undefined} />
                </div>
                {mode === 'CASH' && amt > 0 && (
                  <div>
                    <DenominationCounter amount={amt} counts={counts} onChange={setCounts} />
                    {errors.denominations && <p className="mt-2 text-caption text-danger-fg">{errors.denominations}</p>}
                  </div>
                )}
                {mode === 'BANK_TRANSFER' && <TextField label="UTR / reference" name="reference" value={reference} onChange={setReference} errors={errors} required />}
                {mode === 'ADJUSTMENT' && <TextAreaV2 label="Why (recorded on the receipt)" placeholder="e.g. Adjusted from the share deposit refund on committee approval." value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} error={errors.remarks ? { show: true, message: errors.remarks } : undefined} />}
              </FormSection>
              {save.error && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't save" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}
              <div className="flex justify-end gap-2">
                <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={() => navigate('/payments')} />
                <ButtonV2 text={`Save receipt${amt > 0 ? ` · ${formatINR(amt)}` : ''}`} disabled={!(amt > 0)} loading={save.isPending} onClick={() => save.mutate()} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-card border border-line bg-surface shadow-raised">
            <header className="border-b border-line-subtle px-5 py-4">
              <h2 className="text-card-title text-fg">What they owe</h2>
              <p className="text-caption text-fg-tertiary">Unpaid from posted demand sheets</p>
            </header>
            {!member ? (
              <p className="px-5 py-6 text-caption text-fg-tertiary">Choose a member to see their dues.</p>
            ) : !dues.data ? (
              <p className="px-5 py-6 text-caption text-fg-tertiary">Loading…</p>
            ) : (
              <div className="divide-y divide-line-subtle">
                {dues.data.arrears.map((a) => (
                  <div key={a.cycle} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-label text-fg">{cycleLabel(a.cycle)}</p>
                      <Money value={a.unpaid} tone="debit" className="text-label" />
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {a.components.filter((c) => c.unpaid > 0).map((c, i) => (
                        <li key={i} className="flex justify-between text-caption text-fg-secondary">
                          <span>{c.label}</span>
                          <span className="tabular">{formatINR(c.unpaid)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {dues.data.shareCapitalDue > 0 && (
                  <div className="flex items-center justify-between px-5 py-3">
                    <p className="text-label text-fg">Share capital (first demand)</p>
                    <Money value={dues.data.shareCapitalDue} tone="debit" className="text-label" />
                  </div>
                )}
                {!dues.data.arrears.length && !dues.data.shareCapitalDue && <p className="px-5 py-6 text-caption text-success-fg">Nothing unpaid. Every posted month was recovered in full.</p>}
              </div>
            )}
          </section>
          {preview.length > 0 && (
            <section className="rounded-card border border-brand-border bg-brand-subtle px-5 py-4">
              <p className="text-caption-strong text-brand-text">This receipt pays</p>
              <ul className="mt-2 space-y-1">
                {preview.map((p, i) => (
                  <li key={i} className="flex justify-between text-caption text-fg">
                    <span>
                      {cycleLabel(p.cycle)} · {p.label}
                      {p.loanNo ? ` · ${p.loanNo}` : ''}
                    </span>
                    <span className="tabular">{formatINR(p.delta)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
