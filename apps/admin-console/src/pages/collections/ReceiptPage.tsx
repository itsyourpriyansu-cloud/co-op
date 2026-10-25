// ST-46 Receipt detail (+ ST-52 print): letterhead, who paid what for which month and head, the
// notes counted for cash, the cashier and a "seal" stamp.
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSearch, Printer } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { DENOMINATIONS, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Letterhead, PrintSheet } from '@/components/Letterhead';
import { Seal } from '@/components/Seal';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { PURPOSE_LABEL, SOURCE_LABEL, cycleLabel } from './collections';

export function ReceiptPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.receipts.get(id) });
  const d = q.data;
  const r = d?.receipt;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <ButtonV2 text="Payments" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/payments')} />
        {r && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
      </div>
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'empty' : 'ready'} layout="detail" empty={{ icon: FileSearch, title: 'Receipt not found', action: { label: 'Back to Payments', onClick: () => navigate('/payments') } }}>
        {d && r && (
          <PrintSheet>
            <Letterhead />
            <h2 className="mt-5 text-center text-card-title tracking-wide">RECEIPT</h2>
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
    </>
  );
}
