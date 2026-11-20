// D-131: correcting a member's date of retirement. Only the Super Admin proposes it; the Accountant,
// the Secretary and the President approve in that order, and the date changes on the President's
// approval. The member edit form no longer changes it.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Circle, X } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type, SnackbarV2Variant, TextAreaV2, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDate, formatDisplayDateTime, RETIREMENT_CHANGE_APPROVERS } from '@tgs/domain';
import type { MemberDetail, RetirementChange } from '@tgs/types';
import { fieldErrorsOf } from '@/components/Form';
import { Panel } from '@/components/Panel';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';

const ROLE_NAME: Record<string, string> = { ACCOUNTANT: 'Accountant', SECRETARY: 'Secretary', PRESIDENT: 'President' };

function Steps({ c }: { c: RetirementChange }) {
  return (
    <ol className="flex flex-col gap-2">
      <li className="flex items-start gap-2 text-caption text-fg-secondary">
        <Check size={16} className="mt-0.5 shrink-0 text-success-fg" aria-hidden />
        <span>
          <span className="text-label text-fg">Proposed</span> by {c.proposed.byName} (Super Admin) · {formatDisplayDateTime(c.proposed.at)}
        </span>
      </li>
      {RETIREMENT_CHANGE_APPROVERS.map((role, i) => {
        const done = c.approvals[i];
        const rejected = !done && c.rejection?.role === role;
        return (
          <li key={role} className="flex items-start gap-2 text-caption text-fg-secondary">
            {done ? <Check size={16} className="mt-0.5 shrink-0 text-success-fg" aria-hidden /> : rejected ? <X size={16} className="mt-0.5 shrink-0 text-danger-fg" aria-hidden /> : <Circle size={16} className="mt-0.5 shrink-0 text-fg-tertiary" aria-hidden />}
            <span>
              <span className="text-label text-fg">{ROLE_NAME[role]}</span>
              {done ? ` approved · ${done.byName} · ${formatDisplayDateTime(done.at)}` : rejected ? ` rejected · ${c.rejection!.byName}: ${c.rejection!.remarks ?? ''}` : c.status === 'PENDING' && c.nextApprover === role ? ' · waiting' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RetirementChangePanel({ d }: { d: MemberDetail }) {
  const qc = useQueryClient();
  const c = d.retirementChange;
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => api.members.decideRetirementChange(d.member.id, decision, remarks.trim() || undefined),
    onSuccess: (next, decision) => {
      qc.setQueryData(['member', d.member.id], next);
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      setRemarks('');
      const changed = next.retirementChange?.status === 'APPROVED';
      addSnackbarV2({ header: decision === 'reject' ? 'Rejected' : changed ? 'Date of retirement changed' : 'Approved', description: changed ? `Now ${formatDisplayDate(next.member.dor)}` : undefined, variant: SnackbarV2Variant.SUCCESS });
    },
  });
  const errors = fieldErrorsOf(decide.error);
  if (!c && !d.can.proposeRetirementChange) return null;
  return (
    <Panel title="Date of retirement" subtitle="Super Admin proposes; Accountant, Secretary and President approve">
      <div className="flex flex-col gap-3">
        {c && (
          <>
            <p className="text-body text-fg">
              {formatDisplayDate(c.currentDor)} → <strong>{formatDisplayDate(c.newDor)}</strong>
              <span className="text-fg-secondary"> · {c.status === 'PENDING' ? `waiting for the ${ROLE_NAME[c.nextApprover ?? ''] ?? ''}` : c.status === 'APPROVED' ? 'approved' : 'rejected'}</span>
            </p>
            <p className="text-caption text-fg-secondary">Reason: {c.reason}</p>
            <Steps c={c} />
          </>
        )}
        {d.can.decideRetirementChange && (
          <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
            <TextAreaV2 label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Needed to reject" error={errors.remarks ? { show: true, message: errors.remarks } : undefined} />
            {decide.isError && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(decide.error) ? decide.error.message : 'Try again.'} />}
            <div className="flex gap-2">
              <ButtonV2 text="Approve" buttonType={ButtonV2Type.PRIMARY} loading={decide.isPending && decide.variables === 'approve'} disabled={decide.isPending} onClick={() => decide.mutate('approve')} />
              <ButtonV2 text="Reject" buttonType={ButtonV2Type.DANGER} loading={decide.isPending && decide.variables === 'reject'} disabled={decide.isPending} onClick={() => decide.mutate('reject')} />
            </div>
          </div>
        )}
        {d.can.proposeRetirementChange && <ButtonV2 text="Change date of retirement" buttonType={ButtonV2Type.SECONDARY} width="100%" leftSlot={{ slot: <CalendarClock size={16} /> }} onClick={() => setOpen(true)} />}
      </div>
      <ProposeDrawer d={d} open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

function ProposeDrawer({ d, open, onClose }: { d: MemberDetail; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newDor, setNewDor] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) return;
    setNewDor('');
    setReason('');
  }, [open]);
  const save = useMutation({
    mutationFn: () => api.members.proposeRetirementChange(d.member.id, { newDor, reason: reason.trim() }),
    onSuccess: (next) => {
      qc.setQueryData(['member', d.member.id], next);
      addSnackbarV2({ header: 'Sent for approval', description: 'The Accountant approves first, then the Secretary and the President.', variant: SnackbarV2Variant.SUCCESS });
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="Change date of retirement"
      description={`${d.member.name} · now ${formatDisplayDate(d.member.dor)}`}
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} disabled={save.isPending} />
          <ButtonV2 text="Send for approval" buttonType={ButtonV2Type.PRIMARY} disabled={!newDor} loading={save.isPending} onClick={() => save.mutate()} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {save.isError && !Object.keys(errors).length && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not sent" description={isApiError(save.error) ? save.error.message : 'Try again.'} />}
        {d.dorWarning && <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Expected date" description={d.dorWarning} />}
        <TextInputV2 label="New date of retirement" type="date" value={newDor} onChange={(e) => setNewDor(e.target.value)} required error={errors.newDor ? { show: true, message: errors.newDor } : undefined} />
        <TextAreaV2 label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Service register entry, G.O. reference" error={errors.reason ? { show: true, message: errors.reason } : undefined} />
        <p className="text-caption text-fg-tertiary">The date changes only after the Accountant, the Secretary and the President have each approved.</p>
      </div>
    </SideDrawer>
  );
}
