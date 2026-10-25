// ST-52 Fixed Deposit Receipt (FDR): issued when the President accepts (D-027). Letterhead with the
// seal, the deposit terms, holders and nominee, the four F4 rules, and both acceptances.
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSearch, Printer } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { Seal } from '@/components/Seal';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

const PAYOUT: Record<string, string> = { MONTHLY: 'monthly', QUARTERLY: 'quarterly', HALF_YEARLY: 'half-yearly', ON_MATURITY: 'on maturity' };

export function FdrPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id) });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const d = q.data;
  const dep = d?.deposit;
  const society = settings.data?.society;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <ButtonV2 text="Deposit" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(`/deposits/${id}`)} />
        {dep?.fdrNo && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
      </div>
      <ViewState state={q.isLoading ? 'loading' : !dep?.fdrNo ? 'empty' : 'ready'} layout="detail" empty={{ icon: FileSearch, title: 'No FDR yet', description: 'The receipt is issued when the President accepts the deposit.' }}>
        {d && dep && (
          <article data-theme="light" className="mx-auto max-w-3xl rounded-card border-4 border-double border-[#1b3a6b] bg-surface px-10 py-8 text-[#111] shadow-raised print:shadow-none">
            <header className="flex items-center gap-5 border-b-2 border-[#1b3a6b] pb-4">
              <Seal size={64} />
              <div className="flex-1">
                <h1 className="text-section-title">{society?.name ?? 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.'}</h1>
                <p className="text-caption">Regd. No. {society?.registrationNo ?? 'P-929'} · {society?.address}</p>
              </div>
            </header>
            <h2 className="mt-5 text-center text-card-title tracking-wide">FIXED DEPOSIT RECEIPT</h2>
            <div className="mt-4 flex justify-between text-body">
              <span>FDR No. {dep.fdrNo}</span>
              <span>Account {dep.accountNo}</span>
            </div>
            <p className="mt-5 text-body leading-relaxed">
              Received from <strong>{d.member.name}</strong> (General No. {d.member.generalNo}, {d.member.designation}, {d.member.departmentName})
              {dep.jointHolders.length ? ` jointly with ${dep.jointHolders.join(', ')}` : ''}
              {dep.minor ? ` for ${dep.minor.name} (minor, born ${formatDisplayDate(dep.minor.dob)})` : ''} the sum of <strong>{formatINR(dep.principal ?? 0)}</strong> ({amountInWords(dep.principal ?? 0)}) as a fixed deposit for {dep.tenureMonths} months from {formatDisplayDate(dep.openedOn)} at{' '}
              {dep.ratePercent}% a year, interest payable {PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY']}.
            </p>
            <table className="mt-5 w-full text-body">
              <tbody className="[&_td]:border [&_td]:border-[#999] [&_td]:px-3 [&_td]:py-1.5">
                <tr>
                  <td>Date of maturity</td>
                  <td className="text-right">{dep.maturityDate ? formatDisplayDate(dep.maturityDate) : '—'}</td>
                </tr>
                <tr>
                  <td>Amount payable on maturity</td>
                  <td className="text-right">{formatINR(dep.maturityValue ?? dep.principal ?? 0)}</td>
                </tr>
                <tr>
                  <td>Operation</td>
                  <td className="text-right">{dep.operationMode === 'SINGLE' ? 'Single' : dep.operationMode === 'EITHER_OR_SURVIVOR' ? 'Either or survivor' : 'Any one or survivor'}</td>
                </tr>
                <tr>
                  <td>Nominee</td>
                  <td className="text-right">{dep.nominee ? `${dep.nominee.name} (${dep.nominee.relation})` : '—'}</td>
                </tr>
              </tbody>
            </table>
            <h3 className="mt-5 text-label">Rules</h3>
            <ol className="mt-1 list-decimal pl-5 text-caption leading-relaxed">
              {d.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <div className="mt-10 grid grid-cols-2 gap-10 text-body">
              {(
                [
                  ['Secretary', dep.signOffs?.secretary],
                  ['President', dep.signOffs?.president],
                ] as const
              ).map(([label, s]) => (
                <div key={label}>
                  <p className="font-semibold">{s?.byName ?? '—'}</p>
                  <p>{label} · Accepted</p>
                  <p className="text-caption">{s ? `Signed digitally · ${formatDisplayDateTime(s.at)}` : ''}</p>
                </div>
              ))}
            </div>
          </article>
        )}
      </ViewState>
    </>
  );
}
