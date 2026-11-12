// G1 (D-111, BR-040): pay a loan off early at the counter. The quote is the outstanding principal plus
// interest to today (the same rule as a top-up settlement). Unpaid instalments are taken as dues first;
// a loan on a demand already certified or with the DDO waits for that recovery to post.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2Type, ModalV2, TextAreaV2 } from '@juspay/blend-design-system';
import { isApiError, newIdempotencyKey } from '@tgs/api-client';
import { formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { LoanClosureInput } from '@tgs/types';
import { useAuth } from '@/app/auth';
import { Chips } from '@/components/Chips';
import { DenominationCounter, type Counts } from '@/components/DenominationCounter';
import { TextField, fieldErrorsOf } from '@/components/Form';
import { Panel } from '@/components/Panel';
import { api } from '@/lib/api';

export function LoanClosurePanel({ loanId }: { loanId: string }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const canReceive = session?.user.role === 'CASHIER' || session?.user.role === 'ACCOUNTANT';
  const q = useQuery({ queryKey: ['loan-closure', loanId], queryFn: () => api.receipts.closureQuote(loanId), retry: false });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LoanClosureInput['mode']>('CASH');
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [idemKey] = useState(newIdempotencyKey);
  const p = q.data;
  const coins = p ? p.total % 1000 : 0;
  const close = useMutation({
    mutationFn: () => api.receipts.closeLoan(loanId, { mode, amount: p!.total, ...(mode === 'CASH' ? { denominations: counts, ...(coins ? { coins } : {}) } : { reference: reference.trim() }), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, idemKey),
    onSuccess: (r) => navigate(`/payments/${r.receipt.id}`),
  });
  if (!p) return null;
  const errors = fieldErrorsOf(close.error);
  return (
    <Panel title="Close the loan early" subtitle="Outstanding principal and interest up to today (BR-040)">
      <dl className="flex flex-col gap-1.5">
        <div className="flex justify-between text-label text-fg">
          <dt>Principal outstanding</dt>
          <dd className="tabular">{formatINR(p.principal)}</dd>
        </div>
        <div className="flex justify-between text-label text-fg">
          <dt>
            Interest from {formatDisplayDate(p.interestFrom)} <span className="text-caption text-fg-tertiary">({p.ratePercent}% a year)</span>
          </dt>
          <dd className="tabular">{formatINR(p.interest)}</dd>
        </div>
        <div className="flex justify-between border-t border-line-subtle pt-1.5 text-card-title text-fg">
          <dt>To close today</dt>
          <dd className="tabular">{formatINR(p.total)}</dd>
        </div>
      </dl>
      {p.blockers.map((b) => (
        <p key={b} className="mt-2 text-caption text-warning-fg">
          {b}
        </p>
      ))}
      {p.canClose && p.draftCycles.length > 0 && <p className="mt-2 text-caption text-fg-tertiary">The instalment comes off the {p.draftCycles.map(formatCycle).join(', ')} demand, which is not certified yet.</p>}
      {canReceive && p.canClose && (
        <div className="mt-3">
          <ButtonV2 text="Take the closing payment" size={ButtonV2Size.SMALL} buttonType={ButtonV2Type.PRIMARY} onClick={() => setOpen(true)} />
        </div>
      )}
      <ModalV2
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Close ${p.loanNo}`}
        subtitle={`${p.memberName} (${p.generalNo}) pays ${formatINR(p.total)}. This posts to the ledger and closes the loan.`}
        primaryAction={{ text: close.isPending ? 'Saving…' : `Save receipt · ${formatINR(p.total)}`, onClick: () => close.mutate(), disabled: close.isPending || (mode === 'BANK_TRANSFER' && !reference.trim()) }}
        secondaryAction={{ text: 'Cancel', buttonType: ButtonV2Type.SECONDARY, onClick: () => setOpen(false) }}
      >
        <div className="flex flex-col gap-3">
          <Chips label="Received as" value={mode} onChange={setMode} options={[{ value: 'CASH', label: 'Cash', hint: 'Count the notes' }, { value: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'UTR / reference' }]} />
          {mode === 'CASH' ? (
            <div className="flex flex-col gap-2">
              <DenominationCounter amount={p.total - coins} counts={counts} onChange={setCounts} />
              {coins > 0 && <p className="text-caption text-fg-secondary">Plus {formatINR(coins)} in coins, which notes cannot make.</p>}
              {errors.denominations && <p className="text-caption text-danger-fg">{errors.denominations}</p>}
            </div>
          ) : (
            <TextField label="UTR / reference" name="reference" value={reference} onChange={setReference} errors={errors} required />
          )}
          <TextAreaV2 label="Remarks (optional)" placeholder="e.g. Paid from the member's own savings" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          {close.error && !Object.keys(errors).length && <p className="text-caption text-danger-fg">{isApiError(close.error) ? close.error.message : 'Try again.'}</p>}
        </div>
      </ModalV2>
    </Panel>
  );
}
