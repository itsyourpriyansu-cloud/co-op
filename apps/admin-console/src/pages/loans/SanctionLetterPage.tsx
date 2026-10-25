// ST-52 Sanction letter (print preview): generated after the President signs (D-027). Society
// letterhead with the seal, the sanction terms from the sanction sheet and both signatures.
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSearch, Printer } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { amountInWords, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Seal } from '@/components/Seal';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

export function SanctionLetterPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['loan', id], queryFn: () => api.loans.get(id) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const d = q.data;
  const l = d?.loan;
  const sheet = l?.sanctionSheet;
  const society = settings.data?.society;
  const ready = Boolean(d && l?.sanctionLetterNo && sheet);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <ButtonV2 text="Loan" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(`/loans/${id}`)} />
        {ready && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
      </div>
      <ViewState
        state={q.isLoading ? 'loading' : !ready ? 'empty' : 'ready'}
        layout="detail"
        empty={{ icon: FileSearch, title: 'No sanction letter yet', description: 'The letter is generated when the President signs the sanction.', action: { label: 'Back to the loan', onClick: () => navigate(`/loans/${id}`) } }}
      >
        {d && l && sheet && (
          <article className="mx-auto max-w-3xl rounded-card border border-line bg-white px-10 py-10 text-[#111] shadow-raised print:border-0 print:shadow-none">
            <header className="flex items-center gap-5 border-b-2 border-[#111] pb-5">
              <Seal size={72} />
              <div>
                <h1 className="text-section-title">{society?.name ?? 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.'}</h1>
                <p className="text-caption">
                  Regd. No. {society?.registrationNo ?? 'P-929'} · {society?.address}
                </p>
              </div>
            </header>
            <div className="mt-6 flex justify-between text-body">
              <span>Ref: {l.sanctionLetterNo}</span>
              <span>Date: {formatDisplayDate((l.signOffs?.president?.at ?? '').slice(0, 10) || l.appliedOn)}</span>
            </div>
            <p className="mt-6 text-body">
              To
              <br />
              {d.member.name}, General No. {d.member.generalNo}
              <br />
              {d.member.designation}, {d.member.departmentName}
            </p>
            <h2 className="mt-6 text-card-title underline">Sub: Sanction of {d.product.name} — application {l.applicationNo}</h2>
            <p className="mt-4 text-body leading-relaxed">
              With reference to your application dated {formatDisplayDate(l.appliedOn)}, the society has sanctioned a {d.product.name} of <strong>{formatINR(sheet.amount)}</strong> ({amountInWords(sheet.amount)}) at {sheet.ratePercent}% a year, repayable in <strong>{sheet.instalments} monthly instalments</strong>{' '}
              from {formatCycle(sheet.firstDueCycle)}, recovered from your salary by your Drawing & Disbursing Officer.
            </p>
            <table className="mt-5 w-full text-body">
              <tbody className="[&_td]:border [&_td]:border-[#999] [&_td]:px-3 [&_td]:py-1.5">
                <tr>
                  <td>Sanctioned amount</td>
                  <td className="text-right">{formatINR(sheet.amount)}</td>
                </tr>
                <tr>
                  <td>Monthly instalment (first → last)</td>
                  <td className="text-right">
                    {formatINR(sheet.emi)}
                    {sheet.lastEmi !== sheet.emi ? ` → ${formatINR(sheet.lastEmi)}` : ''}
                  </td>
                </tr>
                {sheet.topup && (
                  <tr>
                    <td>Settlement of loan {sheet.topup.loanNo} (incl. interest to date)</td>
                    <td className="text-right">− {formatINR(sheet.topup.settlement)}</td>
                  </tr>
                )}
                <tr>
                  <td>Share deposit deduction</td>
                  <td className="text-right">− {formatINR(sheet.shareDeduction)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Net amount payable to you</strong>
                  </td>
                  <td className="text-right">
                    <strong>{formatINR(sheet.netDisbursable)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-5 text-body leading-relaxed">The loan is subject to the bye-laws of the society and the salary recovery agreement signed by you{d.sureties.length ? ` and your sureties (${d.sureties.map((s) => s.name).join(', ')})` : ''}.</p>
            <div className="mt-12 grid grid-cols-2 gap-10 text-body">
              {[
                { label: 'Secretary', s: l.signOffs?.secretary },
                { label: 'President', s: l.signOffs?.president },
              ].map((x) => (
                <div key={x.label}>
                  <p className="font-semibold">{x.s?.byName}</p>
                  <p>{x.label}</p>
                  <p className="text-caption">Signed digitally · {x.s ? formatDisplayDateTime(x.s.at) : ''}</p>
                </div>
              ))}
            </div>
          </article>
        )}
      </ViewState>
    </>
  );
}
