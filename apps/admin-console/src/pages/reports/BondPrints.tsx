// D-099: digital twins of the forms received on 05 Nov 2026 (docs/16 §F7–F10, docs/paper-forms):
// the Ordinary / Education loan bond (F8) or Salary loan bond (F9) with the loan receipt (F7), and
// the Fixed Deposit voucher (F10). Signatures are the ones kept on the records (D-096).
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { ArrowLeft, Printer } from 'lucide-react';
import { amountInWords, formatDisplayDate, formatINR } from '@tgs/domain';
import { Letterhead, PrintSheet } from '@/components/Letterhead';
import { SignatureMark } from '@/components/SignatureMark';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

function Toolbar({ back, label, ready }: { back: string; label: string; ready: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
      <ButtonV2 text={label} buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(back)} />
      {ready && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
    </div>
  );
}

/** One signature line: the stored image when there is one, the name otherwise. */
function Sign({ label, name, fileId, children }: { label: string; name?: string; fileId?: string; children?: ReactNode }) {
  return (
    <div>
      <div className="flex min-h-[2.75rem] items-end border-b border-[#555] pb-1 text-body italic">{fileId && name ? <SignatureMark fileId={fileId} name={name} className="h-10" /> : name ? `Signed: ${name}` : ''}</div>
      <p className="mt-1 font-medium">{label}</p>
      {children}
    </div>
  );
}

/** F8 / F9 bond with the F7 receipt, for a sanctioned or disbursed loan. */
export function LoanBondPrintPage() {
  const [params] = useSearchParams();
  const id = params.get('loan') ?? '';
  const q = useQuery({ queryKey: ['loan', id], queryFn: () => api.loans.get(id), enabled: Boolean(id) });
  const d = q.data;
  const l = d?.loan;
  const salary = l?.product === 'SALARY';
  const amount = l ? (l.sanctionedAmount ?? l.appliedAmount) : 0;
  const received = l?.disbursement?.amount ?? 0;
  const dept = d ? `${d.member.designation}, ${d.member.departmentName}` : '';
  return (
    <>
      <Toolbar back={`/loans/${id}`} label="Loan" ready={Boolean(l)} />
      <ViewState state={q.isLoading ? 'loading' : !l ? 'empty' : 'ready'} layout="detail">
        {d && l && (
          <PrintSheet>
            <Letterhead />
            <div className="mt-3 grid grid-cols-3 text-caption">
              <span>G.I. No. {d.member.generalNo}</span>
              <span>Dept. {d.member.departmentName}</span>
              <span className="text-right">Posted in Folio No. {l.loanNo ?? '—'} · Vol. No. {(l.disbursedOn ?? l.appliedOn).slice(0, 4)}</span>
              {!salary && <span>L. No. {l.loanNo ?? l.applicationNo}</span>}
            </div>
            <h2 className="mt-5 text-center text-card-title tracking-wide">{salary ? 'SALARY LOAN BOND' : 'ORDINARY LOAN / EDUCATION LOAN BOND'}</h2>
            <p className="mt-4 text-body leading-relaxed">
              ON DEMAND {salary ? 'I promise' : 'we jointly and severally promise'} to pay the Telangana Secretariat Employees Cooperative Credit Society Ltd., Hyderabad, or order the sum of <strong>{formatINR(amount)}</strong> (Rupees {amountInWords(amount)} only) for value received in cash with interest {salary ? 'thereon ' : ''}from the date hereof until payment in full at the rate of <strong>{l.ratePercent}%</strong> per annum calculated at monthly rates.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-8 text-body">
              <div className="text-caption">
                <p>Rs. {formatINR(amount)}</p>
                <p>Date: {l.signature ? formatDisplayDate(l.signature.signedAt.slice(0, 10)) : '—'}</p>
              </div>
              <Sign label="Borrower's signature" {...(l.signature ? { name: d.member.name } : {})} {...(l.signature?.fileId ? { fileId: l.signature.fileId } : {})}>
                <p className="text-caption">{d.member.name.toUpperCase()} · {dept}</p>
              </Sign>
            </div>
            {!salary && d.sureties.length > 0 && (
              <div className="mt-8">
                <p className="text-body font-semibold">Surety:</p>
                <div className="mt-2 grid grid-cols-2 gap-8 text-body">
                  {d.sureties.map((s) => {
                    const raw = l.sureties.find((x) => x.memberId === s.memberId);
                    const signed = raw?.status === 'ACCEPTED';
                    return (
                      <Sign key={s.memberId} label="Signature" {...(signed ? { name: s.name } : {})} {...(signed && raw?.signatureFileId ? { fileId: raw.signatureFileId } : {})}>
                        <p className="text-caption">({s.name.toUpperCase()}) · G.No. {s.generalNo} · {s.designation}, {s.departmentName}</p>
                      </Sign>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-10 border-t border-dashed border-[#999] pt-6">
              <p className="text-body leading-relaxed">
                Received from the T.G. Secretariat Employees Cooperative Credit Society Ltd., the sum of <strong>{formatINR(received)}</strong> (Rupees {received ? amountInWords(received) : '—'} only) being {salary ? 'salary' : l.product === 'EDUCATION' ? 'education' : 'ordinary'} loan.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-8 text-body">
                <div className="text-caption">Date: {l.disbursement ? formatDisplayDate(l.disbursement.date) : '—'}</div>
                <Sign label="Signature" {...(l.receiptAck ? { name: d.member.name } : {})} {...(l.receiptAck?.fileId ? { fileId: l.receiptAck.fileId } : {})} />
              </div>
              <p className="mt-4 text-caption">N.B.: In the case of authorisation please sign this also.</p>
              <div className="mt-2 grid grid-cols-2 gap-8 text-body">
                <div className="text-caption">
                  <p>Verified</p>
                  <p className="mt-6 font-medium">Account / Manager: {l.signOffs?.review?.byName ?? ''}</p>
                </div>
                <div>
                  <p className="text-caption">Please pay the above amount to Sri {l.disbursement?.payee ?? '…………………………'} and oblige</p>
                  <Sign label="Signature" {...(l.disbursement?.payee && l.receiptAck ? { name: d.member.name } : {})} {...(l.disbursement?.payee && l.receiptAck?.fileId ? { fileId: l.receiptAck.fileId } : {})} />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-8 text-body">
                <div className="text-caption">
                  <p>Received Rupees {received ? formatINR(received) : ''}</p>
                  <p className="mt-2">Name &amp; G.I. No.: {d.member.name}, {d.member.generalNo}</p>
                  <p>Designation &amp; Dept.: {dept}</p>
                </div>
                <div className="text-center">
                  <p className="text-card-title tracking-wide">{l.disbursement ? '"PAID"' : ''}</p>
                  <Sign label="Cashier" {...(l.disbursement ? { name: l.disbursement.byName } : {})} {...(l.disbursement?.signatureFileId ? { fileId: l.disbursement.signatureFileId } : {})} />
                </div>
              </div>
            </div>
            <p className="mt-6 text-[10px] text-[#777]">Digital twin of the society's {salary ? 'salary loan bond (F9)' : 'loan bond (F8)'} and loan receipt (F7). Signed with OTP (D-031); signatures from the records (D-096).</p>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}

/** F10: the voucher for money paid out of an FD (maturity, early withdrawal, refund). */
export function FdVoucherPrintPage() {
  const [params] = useSearchParams();
  const id = params.get('deposit') ?? '';
  const no = params.get('vr') ?? '';
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id), enabled: Boolean(id) });
  const dep = q.data?.deposit;
  const v = dep?.vouchers?.find((x) => x.no === no) ?? dep?.vouchers?.at(-1);
  const m = q.data?.member;
  return (
    <>
      <Toolbar back={`/deposits/${id}`} label="Deposit" ready={Boolean(v)} />
      <ViewState state={q.isLoading ? 'loading' : !v ? 'empty' : 'ready'} layout="detail">
        {dep && v && m && (
          <PrintSheet>
            <Letterhead />
            <h2 className="mt-4 text-center text-card-title tracking-wide">FIXED DEPOSIT VOUCHER</h2>
            <div className="mt-4 flex justify-between text-body">
              <span>Vr. No. {v.no}</span>
              <span>Date: {formatDisplayDate(v.date)}</span>
            </div>
            <p className="mt-4 text-body leading-relaxed">
              Received an amount of <strong>{formatINR(v.amount)}</strong> (in words) Rupees {amountInWords(v.amount)} only towards {v.kind === 'INTEREST' ? `Interest on FDR for the period ending ${formatDisplayDate(v.date)}` : v.kind === 'REFUND' ? 'Refund of FDR' : v.kind === 'PREMATURE' ? 'Interest on FDR and Refund of FDR (closed before maturity)' : 'Interest on FDR and Refund of FDR (on maturity)'}
            </p>
            <ol className="mt-3 list-decimal pl-6 text-body">
              <li>FDR {dep.fdrNo ?? dep.accountNo}: principal {formatINR(v.amount - v.interest)}</li>
              {v.interest > 0 && <li>Interest {formatINR(v.interest)}</li>}
            </ol>
            <div className="mt-8 grid grid-cols-2 gap-8 text-body">
              <div className="text-caption">
                <p>Name: {m.name} (G.I. No. {m.generalNo})</p>
                <p className="mt-2">Passed for Rs. {formatINR(v.amount)}</p>
                <p>Rupees {amountInWords(v.amount)} only</p>
              </div>
              <Sign label="Signature" />
            </div>
            <div className="mt-10 grid grid-cols-2 gap-8 text-body">
              <Sign label="Secretary" />
              <Sign label="Treasurer (Cashier)" name={v.paidByName} {...(v.signatureFileId ? { fileId: v.signatureFileId } : {})} />
            </div>
            <p className="mt-6 text-[10px] text-[#777]">Digital twin of the society's fixed deposit voucher (F10). The member and the Secretary sign the printed copy.</p>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}

/** G2 (D-112): an office payment or receipt voucher (expense paid, other income received). */
export function OfficeVoucherPrintPage() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const q = useQuery({ queryKey: ['office-voucher', id], queryFn: () => api.accounts.voucher(id), enabled: Boolean(id) });
  const v = q.data;
  const pay = v?.kind === 'PAYMENT';
  return (
    <>
      <Toolbar back="/accounts" label="Accounts" ready={Boolean(v)} />
      <ViewState state={q.isLoading ? 'loading' : !v ? 'empty' : 'ready'} layout="detail">
        {v && (
          <PrintSheet>
            <Letterhead />
            <h2 className="mt-4 text-center text-card-title tracking-wide">{pay ? 'PAYMENT VOUCHER' : 'RECEIPT VOUCHER'}</h2>
            <div className="mt-4 flex justify-between text-body">
              <span>Vr. No. {v.voucherNo}</span>
              <span>Date: {formatDisplayDate(v.date)}</span>
            </div>
            {v.reversed && <p className="mt-2 text-center text-label text-danger-fg">CANCELLED (entry reversed)</p>}
            <p className="mt-4 text-body leading-relaxed">
              {pay ? 'Paid to' : 'Received from'} <strong>{v.party}</strong> a sum of <strong>{formatINR(v.amount)}</strong> (Rupees {amountInWords(v.amount)} only) towards {v.narration}.
            </p>
            <table className="mt-4 w-full border border-[#555] text-body">
              <tbody>
                <tr className="border-b border-[#555]">
                  <td className="px-3 py-1.5">Head of account</td>
                  <td className="px-3 py-1.5">
                    {v.headCode} {v.headName}
                  </td>
                </tr>
                <tr className="border-b border-[#555]">
                  <td className="px-3 py-1.5">{pay ? 'Paid by' : 'Received by'}</td>
                  <td className="px-3 py-1.5">{v.mode === 'CASH' ? 'Cash' : `Bank, ref. ${v.reference ?? ''}`}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5">Journal entry</td>
                  <td className="px-3 py-1.5">{v.entryNo}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-10 grid grid-cols-3 gap-8 text-body">
              <Sign label="Prepared by (Accountant)" name={v.createdByName} />
              <Sign label="Secretary" />
              <Sign label={pay ? "Receiver's signature" : 'Cashier'} />
            </div>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}
