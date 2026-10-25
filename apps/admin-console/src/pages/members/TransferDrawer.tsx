// ST-13 Department transfer (J-11, BR-010, BR-028). The member shows the new department at once;
// the demand sheet moves on the first cycle not yet generated for the old department, and the new
// DDO must agree the salary-recovery mandate.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Info, Search } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type, SnackbarV2Variant, TextAreaV2, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatCycle, toCycle } from '@tgs/domain';
import type { MemberDetail } from '@tgs/types';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function TransferDrawer({ detail, open, onClose, today }: { detail: MemberDetail; open: boolean; onClose: () => void; today: string }) {
  const qc = useQueryClient();
  const m = detail.member;
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [date, setDate] = useState(today);
  const [orderRef, setOrderRef] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!open) return;
    setTo('');
    setQ('');
    setDate(today);
    setOrderRef('');
    setRemarks('');
  }, [open, today]);

  const options = useMemo(() => (depts.data ?? []).filter((d) => d.id !== m.departmentId && d.name.toLowerCase().includes(q.trim().toLowerCase())), [depts.data, m.departmentId, q]);
  const target = depts.data?.find((d) => d.id === to);

  const save = useMutation({
    mutationFn: () => api.members.transfer(m.id, { toDepartmentId: to, effectiveDate: date, ...(orderRef.trim() ? { orderRef: orderRef.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }),
    onSuccess: (next) => {
      qc.setQueryData(['member', m.id], next);
      void qc.invalidateQueries({ queryKey: ['members'] });
      const cycle = next.upcomingTransfer?.effectiveCycle ?? next.serviceEvents[0]?.effectiveCycle;
      addSnackbarV2({ header: `Transferred to ${next.department?.name ?? ''}`, description: cycle ? `On their demand sheet from ${formatCycle(cycle)}. The new DDO must agree the mandate.` : undefined, variant: SnackbarV2Variant.SUCCESS });
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="Transfer to another department"
      description={`${m.name} · now in ${detail.department?.name ?? ''}`}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} disabled={save.isPending} />
          <ButtonV2 text="Confirm transfer" buttonType={ButtonV2Type.PRIMARY} disabled={!to || !date} loading={save.isPending} onClick={() => save.mutate()} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {save.isError && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not transferred" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg">New department</h3>
          <TextInputV2 value={q} placeholder="Search departments" leftSlot={{ slot: <Search size={16} className="text-fg-tertiary" /> }} onChange={(e) => setQ(e.target.value)} />
          {/* Chips, not a dropdown: Blend menus render below the drawer layer. */}
          <div role="radiogroup" aria-label="New department" className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-control border border-line p-1">
            {options.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={to === d.id}
                onClick={() => setTo(d.id)}
                className={cn('flex items-center gap-3 rounded-control px-3 py-2 text-left transition-colors', to === d.id ? 'bg-brand-subtle text-brand-text' : 'hover:bg-surface-subtle')}
              >
                <Building2 size={16} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label">{d.name}</span>
                  <span className="block truncate text-caption text-fg-tertiary">
                    DDO {d.ddoName}
                    {d.kind === 'EXTERNAL_OFFICE' ? ' · outside the Secretariat' : ''}
                  </span>
                </span>
              </button>
            ))}
            {!options.length && <p className="px-3 py-4 text-center text-caption text-fg-tertiary">No department matches</p>}
          </div>
          {errors.toDepartmentId && <p className="text-caption text-danger-fg">{errors.toDepartmentId}</p>}
        </section>
        <TextInputV2 label="Effective date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required error={errors.effectiveDate ? { show: true, message: errors.effectiveDate } : undefined} hintText="The date in the transfer order" />
        <TextField label="Order reference" name="orderRef" value={orderRef} onChange={setOrderRef} placeholder="e.g. GAD/TR/2026/0123" hint="Optional" />
        <TextAreaV2 label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Optional" />
        {target && date && (
          <div className="flex gap-3 rounded-card border border-brand-border bg-brand-subtle px-4 py-3">
            <Info size={18} className="mt-0.5 shrink-0 text-brand-text" aria-hidden />
            <div className="text-body text-fg">
              <p>
                Appears under <strong>{target.name}</strong> from the <strong>{safeCycle(date)}</strong> demand sheet, or the next one if {detail.department?.name}'s {safeCycle(date)} sheet is already generated (BR-010).
              </p>
              <p className="mt-1 text-caption text-fg-secondary">
                {target.ddoName} (DDO) must then agree the salary recovery mandate. Until then new loans show a warning (BR-028).
              </p>
            </div>
          </div>
        )}
      </div>
    </SideDrawer>
  );
}

function safeCycle(date: string) {
  try {
    return formatCycle(toCycle(date));
  } catch {
    return 'next';
  }
}
