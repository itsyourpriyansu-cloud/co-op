// F-08 (D-098): a member leaves (retired, resigned, deceased) and is settled. The statement prints
// as a letter to the pay office: what is still owed is recovered from the gratuity (forms F5 / F6);
// what is held is paid to the member, or to the nominee after a death. The Accountant posts it once
// the money has moved.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, TextInputV2 } from '@juspay/blend-design-system';
import { ArrowLeft, Printer } from 'lucide-react';
import { amountInWords, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { SettlementLine, SettlementView } from '@tgs/types';
import { Chips } from '@/components/Chips';
import { FormSection, MoneyField, TextField, fieldErrorsOf, type FieldErrors } from '@/components/Form';
import { Letterhead, PrintSheet } from '@/components/Letterhead';
import { Panel } from '@/components/Panel';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

type ExitStatus = 'RETIRED' | 'RESIGNED' | 'DECEASED';
const EXIT_LABEL: Record<ExitStatus, string> = { RETIRED: 'Retired', RESIGNED: 'Resigned', DECEASED: 'Deceased' };

function Rows({ title, lines, total }: { title: string; lines: SettlementLine[]; total: number }) {
  return (
    <table className="mt-4 w-full border-collapse text-body">
      <thead>
        <tr className="border-b border-[#999] text-left">
          <th className="py-1 font-semibold">{title}</th>
          <th className="py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.length ? lines.map((l) => (
          <tr key={l.key} className="border-b border-[#ddd]">
            <td className="py-1">{l.label}</td>
            <td className="py-1 text-right tabular-nums">{formatINR(l.amount)}</td>
          </tr>
        )) : (
          <tr><td className="py-1 text-[#777]">Nil</td><td /></tr>
        )}
        <tr className="font-semibold">
          <td className="py-1">Total</td>
          <td className="py-1 text-right tabular-nums">{formatINR(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ExitForm({ memberId, onDone }: { memberId: string; onDone: (v: SettlementView) => void }) {
  const [status, setStatus] = useState<ExitStatus>();
  const [date, setDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const exit = useMutation({ mutationFn: () => api.members.exit(memberId, { status: status!, date, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }), onSuccess: onDone, onError: (e) => setErrors(fieldErrorsOf(e)) });
  return (
    <Panel title="Member leaves" subtitle="Demand stops and the final settlement opens. This cannot be undone here.">
      <div className="flex flex-col gap-4">
        <Chips label="Reason" value={status} onChange={setStatus} options={(['RETIRED', 'RESIGNED', 'DECEASED'] as const).map((s) => ({ value: s, label: EXIT_LABEL[s] }))} />
        {errors.status && <p className="text-caption text-danger-fg">{errors.status}</p>}
        <TextInputV2 label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date ? { show: true, message: errors.date } : undefined} />
        <TextField label="Remarks" name="remarks" value={remarks} onChange={setRemarks} errors={errors} hint="e.g. retirement order or death certificate number" />
        {errors.form && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={errors.form} />}
        <ButtonV2 text="Mark as left" buttonType={ButtonV2Type.PRIMARY} disabled={!status || !date} loading={exit.isPending} onClick={() => exit.mutate()} />
      </div>
    </Panel>
  );
}

function PostForm({ view, onDone }: { view: SettlementView; onDone: (v: SettlementView) => void }) {
  const st = view.statement!;
  const deceased = view.settlement?.exit.status === 'DECEASED';
  const [offset, setOffset] = useState(true);
  const [payTo, setPayTo] = useState<'MEMBER' | 'NOMINEE'>(deceased ? 'NOMINEE' : 'MEMBER');
  const required = offset ? Math.max(0, -st.net) : st.totalOwed;
  const paid = offset ? Math.max(0, st.net) : st.totalHeld;
  const [received, setReceived] = useState<number>(required);
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const post = useMutation({ mutationFn: () => api.members.postSettlement(view.member.id, { offset, payTo, received, reference: reference.trim() }), onSuccess: onDone, onError: (e) => setErrors(fieldErrorsOf(e)) });
  return (
    <Panel title="Post the settlement" subtitle="Once the money has moved: one ledger entry closes the loans, deposits and shares.">
      <FormSection title="How the money moves" columns={1}>
        <Chips value={offset ? 'NET' : 'GROSS'} onChange={(v) => { setOffset(v === 'NET'); setReceived(v === 'NET' ? Math.max(0, -st.net) : st.totalOwed); }} options={[{ value: 'NET', label: 'Offset (net only)', hint: 'Credits pay the dues first' }, { value: 'GROSS', label: 'Both in full', hint: 'Dues recovered, credits paid separately' }]} />
        {!deceased && <Chips label="Pay to" value={payTo} onChange={setPayTo} options={[{ value: 'MEMBER', label: view.member.name }, { value: 'NOMINEE', label: `Nominee · ${view.member.nominee?.name ?? '—'}` }]} />}
        <MoneyField label="Received from the pay office (gratuity)" name="received" value={received} onChange={setReceived} errors={errors} hint={required ? `${formatINR(required)} expected` : 'Nothing to receive'} />
        <p className="text-body text-fg">To pay: <strong>{formatINR(paid)}</strong> to {payTo === 'NOMINEE' ? `the nominee, ${view.member.nominee?.name ?? ''}` : view.member.name}</p>
        <TextField label="Cheque / transfer reference" name="reference" value={reference} onChange={setReference} errors={errors} required />
      </FormSection>
      {errors.form && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not posted" description={errors.form} />}
      <ButtonV2 text="Post the settlement" buttonType={ButtonV2Type.PRIMARY} loading={post.isPending} onClick={() => post.mutate()} />
    </Panel>
  );
}

export function SettlementPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settlement', id], queryFn: () => api.members.settlement(id) });
  const set = (v: SettlementView) => {
    qc.setQueryData(['settlement', id], v);
    void qc.invalidateQueries({ queryKey: ['member', id] });
  };
  const v = q.data;
  const s = v?.settlement;
  const st = v?.statement;
  const deceased = s?.exit.status === 'DECEASED';

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <ButtonV2 text="Member" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(`/members/${id}`)} />
        {st && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
      </div>
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail" onRetry={() => void q.refetch()}>
        {v && (
          <div className="flex flex-col gap-6">
            {!s && v.canExit && <div className="print:hidden"><ExitForm memberId={id} onDone={set} /></div>}
            {!s && !v.canExit && <p className="text-body text-fg-secondary">{v.member.name} has not left the society.</p>}
            {s && st && (
              <PrintSheet>
                <Letterhead />
                <div className="mt-4 flex justify-between text-body">
                  <span>Ref: TGSECCSL/FS/{v.member.generalNo}</span>
                  <span>Date: {formatDisplayDate((s.posted?.at ?? s.exit.at).slice(0, 10))}</span>
                </div>
                <p className="mt-4 text-body">
                  To<br />
                  {v.department ? `${v.department.ddoDesignation}, ${v.department.name}` : 'The Pay Disbursing Officer'}
                  <br />
                  Dr. B.R Ambedkar Telangana Secretariat, Hyderabad
                </p>
                <h2 className="mt-6 text-center text-card-title tracking-wide underline">FINAL SETTLEMENT · {EXIT_LABEL[s.exit.status as ExitStatus].toUpperCase()} MEMBER</h2>
                <p className="mt-4 text-body leading-relaxed">
                  Sri / Smt <strong>{v.member.name}</strong>, General No. {v.member.generalNo}, {v.member.designation}, {v.member.departmentName}, {deceased ? 'passed away' : s.exit.status === 'RETIRED' ? 'retired' : 'resigned'} on {formatDisplayDate(s.exit.date)}. The member's account with the society as on that date is:
                </p>
                <Rows title="Due to the society" lines={st.owes} total={st.totalOwed} />
                <Rows title="Held by the society for the member" lines={st.holds} total={st.totalHeld} />
                <p className="mt-6 text-body leading-relaxed">
                  {st.net < 0 ? (
                    <>As agreed by the member in the salary recovery agreement, you are requested to recover <strong>{formatINR(-st.net)}</strong> ({amountInWords(-st.net)}) from the member's gratuity and other terminal benefits and remit it to the society.</>
                  ) : st.net > 0 ? (
                    <>Nothing is due to the society. <strong>{formatINR(st.net)}</strong> ({amountInWords(st.net)}) will be paid to {deceased ? `the nominee, ${v.member.nominee?.name ?? ''} (${v.member.nominee?.relation ?? ''})` : 'the member'}.</>
                  ) : (
                    <>The account is settled in full; nothing is due either way.</>
                  )}
                </p>
                {s.posted && (
                  <p className="mt-4 text-caption text-[#555]">
                    Posted {formatDisplayDateTime(s.posted.at)} by {s.posted.byName}: received {formatINR(s.posted.received)}, paid {formatINR(s.posted.paid)} to {s.posted.payeeName}, ref {s.posted.reference}{s.posted.journalNo ? `, ${s.posted.journalNo}` : ''}.
                  </p>
                )}
                <div className="mt-12 grid grid-cols-2 gap-10 text-body">
                  <div><p className="font-semibold">Accountant</p></div>
                  <div><p className="font-semibold">Secretary</p></div>
                </div>
              </PrintSheet>
            )}
            {s?.status === 'OPEN' && v.canPost && <div className="print:hidden"><PostForm view={v} onDone={set} /></div>}
          </div>
        )}
      </ViewState>
    </>
  );
}
