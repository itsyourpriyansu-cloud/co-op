// ST-46 Receipt detail (+ ST-52 print): letterhead, who paid what for which month and head, the
// notes counted for cash, the cashier and a "seal" stamp.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, FileSearch, Printer } from 'lucide-react';
import { addSnackbarV2, AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SnackbarV2Variant, TextAreaV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { DENOMINATIONS, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Letterhead, PrintSheet } from '@/components/Letterhead';
import { Seal } from '@/components/Seal';
import { SideDrawer } from '@/components/SideDrawer';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { PURPOSE_LABEL, SOURCE_LABEL, cycleLabel } from './collections';

export function ReceiptPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.receipts.get(id) });
  const d = q.data;
  const r = d?.receipt;
  const [cancelling, setCancelling] = useState(false);
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <ButtonV2 text="Payments" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/payments')} />
        <div className="flex gap-2">
          {d?.canCancel && <ButtonV2 text="Cancel receipt" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Ban size={16} /> }} onClick={() => setCancelling(true)} />}
          {r && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
        </div>
      </div>
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'empty' : 'ready'} layout="detail" empty={{ icon: FileSearch, title: 'Receipt not found', action: { label: 'Back to Payments', onClick: () => navigate('/payments') } }}>
        {d && r && (
          <PrintSheet>
            <Letterhead />
            <h2 className="mt-5 text-center text-card-title tracking-wide">RECEIPT</h2>
            {r.cancelled && (
              <p role="status" className="mx-auto mt-3 w-fit rounded border-2 border-danger-border px-4 py-1 text-center text-label tracking-widest text-danger-fg">
                CANCELLED on {formatDisplayDateTime(r.cancelled.at)} by {r.cancelled.byName} · {r.cancelled.reason} · {r.cancelled.entryNo}
              </p>
            )}
            <div className="mt-4 flex justify-between text-body">
              <span>No. {r.receiptNo}</span>
              <span>Date {formatDisplayDate(r.date)}</span>
            </div>
            <p className="mt-5 text-body leading-relaxed">
              Received from <strong>{d.member.name}</strong> (General No. {d.member.generalNo}, {d.member.designation}, {d.member.departmentName}) the sum of <strong>{formatINR(r.amount)}</strong> ({d.amountInWords}) by {SOURCE_LABEL[r.source].toLowerCase()}
              {r.reference ? `, reference ${r.reference}` : ''}
              {r.purpose ? ` towards ${PURPOSE_LABEL[r.purpose].toLowerCase()}` : d.sheet ? ` against the ${cycleLabel(d.sheet.cycle)} demand of ${d.sheet.departmentName}` : ''}.
            </p>
            {d.lines.length > 0 && (
              <table className="mt-5 w-full text-body">
                <thead>
                  <tr className="text-left text-caption-strong">
                    <th className="border border-[#999] px-3 py-1.5">Month</th>
                    <th className="border border-[#999] px-3 py-1.5">Head</th>
                    <th className="border border-[#999] px-3 py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border border-[#999] px-3 py-1.5">{l.cycle ? cycleLabel(l.cycle) : '—'}</td>
                      <td className="border border-[#999] px-3 py-1.5">
                        {l.label}
                        {l.loanNo ? <span className="text-caption"> · {l.loanNo}</span> : null}
                      </td>
                      <td className="tabular border border-[#999] px-3 py-1.5 text-right">{formatINR(l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="text-label">
                    <td className="border border-[#999] px-3 py-1.5" colSpan={2}>
                      Total
                    </td>
                    <td className="tabular border border-[#999] px-3 py-1.5 text-right">{formatINR(r.amount)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {r.denominations && (
              <p className="mt-4 text-caption">
                Notes counted:{' '}
                {DENOMINATIONS.filter((n) => r.denominations?.[n])
                  .map((n) => `₹${n} × ${r.denominations![n]}`)
                  .join(' · ')}
                {r.coins ? ` · coins ${formatINR(r.coins)}` : ''}
              </p>
            )}
            {r.remarks && <p className="mt-2 text-caption">Remarks: {r.remarks}</p>}
            {d.report && <p className="mt-2 text-caption">Reported by the member in the app on {d.report.reportedAt ? formatDisplayDateTime(d.report.reportedAt) : formatDisplayDate(d.report.paidOn)} and verified against the bank statement.</p>}
            <footer className="mt-10 flex items-end justify-between">
              <div className="opacity-80">
                <Seal size={72} />
              </div>
              <div className="text-right">
                <p className="text-label">{r.byName ?? 'Salary recovery (DDO)'}</p>
                <p className="text-caption">{r.source === 'SALARY_RECOVERY' ? 'Posted from the demand sheet' : 'Cashier'}{r.at ? ` · ${formatDisplayDateTime(r.at)}` : ''}</p>
              </div>
            </footer>
          </PrintSheet>
        )}
      </ViewState>
      {d?.canCancel && <CancelDrawer open={cancelling} id={d.receipt.id} label={`${d.receipt.receiptNo} · ${d.member.name} · ${formatINR(d.receipt.amount)}`} onClose={() => setCancelling(false)} />}
    </>
  );
}

/** G9 (D-119): same-day cancellation with a reason; the member's dues and balances go back to before the receipt. */
function CancelDrawer({ open, id, label, onClose }: { open: boolean; id: string; label: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api.receipts.cancel(id, reason.trim()),
    onSuccess: (d) => {
      qc.setQueryData(['receipt', id], d);
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      void qc.invalidateQueries({ queryKey: ['dues', d.member.id] });
      addSnackbarV2({ header: `Receipt ${d.receipt.receiptNo} cancelled`, description: 'Dues restored · member notified', variant: SnackbarV2Variant.SUCCESS });
      onClose();
    },
  });
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="Cancel receipt"
      description="Use this only for a mistake made today. The money is taken back off the member's account and a reversing entry is posted. The receipt stays, marked cancelled."
      footer={
        <div className="flex justify-end gap-2">
          <ButtonV2 text="Keep receipt" buttonType={ButtonV2Type.SECONDARY} onClick={onClose} />
          <ButtonV2 text="Cancel receipt" buttonType={ButtonV2Type.DANGER} disabled={reason.trim().length < 10} loading={cancel.isPending} onClick={() => cancel.mutate()} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-label text-fg">{label}</p>
        <TextAreaV2 label="Reason" placeholder="e.g. Taken against the wrong member; re-issued to the right one." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required hintText="Printed on the receipt and sent to the member. At least 10 characters." />
        {cancel.error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't cancel" description={isApiError(cancel.error) ? cancel.error.message : 'Try again.'} />}
      </div>
    </SideDrawer>
  );
}
