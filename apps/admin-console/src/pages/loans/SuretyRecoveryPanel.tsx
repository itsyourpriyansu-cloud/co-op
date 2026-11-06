// F-13 (D-097): recover an overdue loan from its sureties. After the set number of unpaid months
// the Accountant asks each surety who signed for an equal share; they pay at the counter or on
// their next demand, and every payment goes to this loan.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2Type } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatCycle, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Panel } from '@/components/Panel';
import { api } from '@/lib/api';

export function SuretyRecoveryPanel({ loanId }: { loanId: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['surety-recovery', loanId], queryFn: () => api.loans.suretyRecovery(loanId), retry: false });
  const raise = useMutation({
    mutationFn: () => api.loans.raiseSuretyRecovery(loanId),
    onSuccess: (p) => {
      setConfirm(false);
      qc.setQueryData(['surety-recovery', loanId], p);
    },
  });
  const p = q.data;
  if (!p || (!p.shares.length && !p.recoveries.length)) return null;
  return (
    <Panel title="Recover from sureties" subtitle={`After ${p.threshold} unpaid month${p.threshold === 1 ? '' : 's'} in a row the sureties pay equal shares (F-13)`}>
      {p.recoveries.length ? (
        <ul className="flex flex-col gap-2.5">
          {p.recoveries.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3">
              <span className="text-label text-fg">
                {r.suretyName}
                <span className="block text-caption text-fg-secondary">
                  Share {formatINR(r.share)} · paid {formatINR(r.paid)}
                  {r.demandedCycle ? ` · on the ${formatCycle(r.demandedCycle)} demand` : ''}
                </span>
              </span>
              <span className="text-right text-caption text-fg-secondary">{r.status === 'OPEN' ? `${formatINR(r.due)} due` : r.closedReason === 'BORROWER_PAID' ? 'Closed: borrower paid' : 'Paid'}</span>
            </li>
          ))}
          <li className="text-caption text-fg-tertiary">Raised by {p.recoveries[0]!.raisedByName} · {formatDisplayDateTime(p.recoveries[0]!.raisedOn)}</li>
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body text-fg-secondary">
            {formatINR(p.overdue)} overdue · unpaid {p.consecutiveCycles} month{p.consecutiveCycles === 1 ? '' : 's'} in a row.
          </p>
          {p.eligible && (
            <ul className="flex flex-col gap-1.5">
              {p.shares.map((s) => (
                <li key={s.memberId} className="flex justify-between text-label text-fg">
                  <span>
                    {s.name} <span className="text-caption text-fg-tertiary">({s.generalNo})</span>
                  </span>
                  <span>{formatINR(s.share)}</span>
                </li>
              ))}
            </ul>
          )}
          {p.reason && <p className="text-caption text-fg-tertiary">{p.reason}</p>}
          {raise.error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not raised" description={isApiError(raise.error) ? raise.error.message : 'Try again.'} />}
          {p.eligible && p.canRaise && !confirm && <ButtonV2 text="Recover from sureties" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} onClick={() => setConfirm(true)} />}
          {confirm && (
            <div className="flex flex-col gap-2 rounded-card border border-line bg-surface-subtle p-3">
              <p className="text-body text-fg">Ask {p.shares.length} suret{p.shares.length === 1 ? 'y' : 'ies'} to pay {formatINR(p.overdue)} between them? They and the borrower are told on WhatsApp and in the app.</p>
              <div className="flex gap-2">
                <ButtonV2 text="Yes, ask the sureties" buttonType={ButtonV2Type.PRIMARY} size={ButtonV2Size.SMALL} loading={raise.isPending} onClick={() => raise.mutate()} />
                <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} onClick={() => setConfirm(false)} />
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
