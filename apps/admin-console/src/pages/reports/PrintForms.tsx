// ST-52 printables (docs/05, docs/16, D-063): the defaulter notice and the paper-form twins — F1
// membership, F2 Ordinary / Education loan, F3 Salary loan, F4 fixed deposit, F5 / F6 recovery
// agreements. Each fills the society's original layout from the live record so the office can still
// file paper. Without a record id each page shows a picker.
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, Printer, UserRound } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type } from '@juspay/blend-design-system';
import { amountInWords, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { Address, LoanDetail, MemberDetail, MembershipDetail } from '@tgs/types';
import { Chips } from '@/components/Chips';
import { Letterhead, PrintSheet } from '@/components/Letterhead';
import { MemberSearch } from '@/components/MemberSearch';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

const addr = (a?: Partial<Address>) => (a ? [a.line1, a.line2, a.city, a.district].filter(Boolean).join(', ') + (a.pincode ? ` - ${a.pincode}` : '') : '');
const upper = (s?: string) => (s ?? '').toUpperCase();
const PAYOUT: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', ON_MATURITY: 'On maturity' };

// ---- shared layout ----------------------------------------------------------------------------

function Toolbar({ back, backLabel = 'Reports', ready, children }: { back: string; backLabel?: string; ready: boolean; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <ButtonV2 text={backLabel} buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(back)} />
      <div className="flex items-center gap-2">
        {children}
        {ready && <ButtonV2 text="Print" leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />}
      </div>
    </div>
  );
}

/** "3. Date of Birth ........ 12 Mar 1982" — numbered paper line with a dotted fill. */
function Line({ no, label, value, wide }: { no?: string; label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid items-end gap-3 py-1.5 ${wide ? 'grid-cols-[28px_1fr]' : 'grid-cols-[28px_minmax(180px,42%)_1fr]'}`}>
      <span className="text-caption text-[#444]">{no ? `${no}.` : ''}</span>
      <span className="text-body">{label}</span>
      {!wide && <span className="min-h-[1.5rem] border-b border-dotted border-[#777] pb-0.5 text-body font-medium">{value || ' '}</span>}
    </div>
  );
}

function Signatures({ items }: { items: Array<{ label: string; name?: string; at?: string }> }) {
  return (
    <div className={`mt-10 grid gap-6 text-center text-caption ${items.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {items.map((s) => (
        <div key={s.label}>
          <div className="min-h-[2.5rem] border-b border-[#555] pb-1 text-body italic">{s.name ? `Signed: ${s.name}` : ''}</div>
          <p className="mt-1 font-medium">{s.label}</p>
          {s.at && <p className="text-[#555]">{s.at}</p>}
        </div>
      ))}
    </div>
  );
}

function FormTitle({ form, title, subtitle }: { form: string; title: string; subtitle?: string }) {
  return (
    <div className="mt-5 text-center">
      <p className="text-caption tracking-widest text-[#555]">FORM {form}</p>
      <h2 className="text-card-title tracking-wide">{title}</h2>
      {subtitle && <p className="text-caption text-[#444]">{subtitle}</p>}
    </div>
  );
}

function Picker({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <section className="rounded-card border border-line bg-surface p-5 shadow-raised">{children}</section>
    </>
  );
}

function PickList({ rows, onPick }: { rows: Array<{ id: string; title: string; subtitle: string }>; onPick: (id: string) => void }) {
  if (!rows.length) return <p className="py-6 text-center text-caption text-fg-tertiary">Nothing to print yet.</p>;
  return (
    <ul className="divide-y divide-line-subtle">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onPick(r.id)} className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-surface-subtle">
            <span>
              <span className="block text-label text-fg">{r.title}</span>
              <span className="block text-caption text-fg-tertiary">{r.subtitle}</span>
            </span>
            <ChevronRight size={16} className="text-fg-tertiary" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---- Defaulter notice (REQ-066) -----------------------------------------------------------------

export function DefaulterNoticePrintPage() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get('member');
  const defaulters = useQuery({ queryKey: ['report', 'defaulters', {}], queryFn: () => api.reports.run('defaulters'), enabled: !memberId });
  const q = useQuery({ queryKey: ['defaulter-notice', memberId], queryFn: () => api.reports.defaulterNotice(memberId!), enabled: Boolean(memberId) });
  const n = q.data;
  if (!memberId)
    return (
      <>
        <Toolbar back="/reports" ready={false} />
        <Picker title="Defaulter notice" description="Choose a member. The defaulters (BR-020) are listed first.">
          <div className="mb-4 max-w-md">
            <MemberSearch placeholder="Any member: name or General No." onPick={(m) => setParams({ member: m.id })} />
          </div>
          <ViewState state={defaulters.isLoading ? 'loading' : 'ready'} layout="table">
            <PickList rows={(defaulters.data?.groups ?? []).flatMap((g) => g.rows.map((r) => ({ id: String(r.generalNo), title: `${r.name} · ${r.generalNo}`, subtitle: `${g.label} · ${r.cycles} cycles short · ${formatINR(Number(r.overdue))} overdue` })))} onPick={(id) => setParams({ member: id })} />
          </ViewState>
        </Picker>
      </>
    );
  return (
    <>
      <Toolbar back="/reports/print/defaulter-notice" backLabel="Choose another member" ready={Boolean(n)} />
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail" onRetry={() => void q.refetch()}>
        {n && (
          <PrintSheet>
            <Letterhead />
            <div className="mt-4 flex justify-between text-body">
              <span>Ref: {n.refNo}</span>
              <span>Date: {formatDisplayDate(n.asOf)}</span>
            </div>
            <div className="mt-5 text-body leading-relaxed">
              <p>To</p>
              <p className="font-medium">{n.member.name}</p>
              <p>
                General No. {n.member.generalNo} · {n.member.designation}
              </p>
              <p>{n.member.departmentName}</p>
              <p>{addr(n.member.address)}</p>
            </div>
            <h2 className="mt-6 text-center text-card-title tracking-wide underline">NOTICE OF OVERDUE DUES</h2>
            <p className="mt-4 text-body">{n.text.greeting}</p>
            <p className="mt-3 text-body leading-relaxed">{n.text.body}</p>
            {n.rows.length ? (
              <table className="mt-5 w-full text-body">
                <thead>
                  <tr className="[&_th]:border [&_th]:border-[#999] [&_th]:px-3 [&_th]:py-1.5">
                    <th className="text-left">Month</th>
                    <th className="text-right">Demand</th>
                    <th className="text-right">Recovered</th>
                    <th className="text-right">Unpaid</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:border [&_td]:border-[#999] [&_td]:px-3 [&_td]:py-1.5">
                  {n.rows.map((r) => (
                    <tr key={r.cycle}>
                      <td>{formatCycle(r.cycle)}</td>
                      <td className="tabular text-right">{formatINR(r.demand)}</td>
                      <td className="tabular text-right">{formatINR(r.recovered)}</td>
                      <td className="tabular text-right">{formatINR(r.unpaid)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={3}>Total overdue</td>
                    <td className="tabular text-right">{formatINR(n.totalUnpaid)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="mt-5 rounded border border-[#999] px-3 py-2 text-body">No unpaid months on record. This member is not overdue.</p>
            )}
            <p className="mt-3 text-caption text-[#444]">
              In words: {amountInWords(n.totalUnpaid)}. {n.isDefaulter ? `Short in the last ${n.consecutiveShort} months in a row (defaulter after ${n.defaulterCycles}).` : ''}
            </p>
            <div className="mt-5 rounded border border-[#999] px-4 py-3 text-body">
              <p className="font-medium">How to pay</p>
              <p>
                Bank: {n.payTo.accountName}, A/c {n.payTo.accountNo}, IFSC {n.payTo.ifsc} · UPI {n.payTo.upi}
              </p>
              <p>Cash: {n.payTo.counter}</p>
            </div>
            <p className="mt-4 text-body">{n.text.closing}</p>
            <div className="mt-10 flex justify-end">
              <div className="w-64 text-center text-caption">
                <div className="h-10 border-b border-[#555]" />
                <p className="mt-1 font-medium">Secretary</p>
                <p className="text-[#555]">for TGSECCSL</p>
              </div>
            </div>
            <p className="mt-6 text-[10px] text-[#777]">Wording is a placeholder until the society confirms it (Q-310). Copy to: DDO, {n.member.departmentName}.</p>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}

// ---- F1 Membership application -----------------------------------------------------------------

type F1 = { applicationNo?: string; generalNo?: string; name: string; fatherName: string; dob?: string; present: string; permanent: string; mobile: string; designation: string; office: string; appointment?: string; probation?: string; shares?: number; nominee: string; signedAt?: string; ddo?: { name: string; at: string; designation?: string }; secretary?: string; president?: string };

function fromApplication(d: MembershipDetail): F1 {
  const a = d.application;
  const f = a.form ?? {};
  return {
    applicationNo: a.applicationNo,
    ...(a.allottedGeneralNo ? { generalNo: a.allottedGeneralNo } : {}),
    name: f.personal?.fullName ?? a.name,
    fatherName: f.personal?.fatherName ?? '',
    ...(f.personal?.dob ? { dob: f.personal.dob } : {}),
    present: addr(f.address?.present),
    permanent: f.address?.sameAsPresent ? 'Same as present address' : addr(f.address?.permanent),
    mobile: f.personal?.mobile ?? '',
    designation: a.designation,
    office: d.department?.name ?? '',
    appointment: a.regularAppointmentDate,
    ...(f.employment?.employmentType === 'APPROVED_PROBATIONER' ? { probation: `${f.employment.probationServiceMonths ?? 0} months` } : {}),
    shares: a.sharesProposed,
    nominee: f.nominee?.name ? `${f.nominee.name} (${f.nominee.relation ?? ''})${f.nominee.address ? `, ${f.nominee.address}` : ''}` : '',
    ...(a.signature ? { signedAt: formatDisplayDateTime(a.signature.signedAt) } : {}),
    ...(a.ddoCertification ? { ddo: { name: a.ddoCertification.byName, at: formatDisplayDateTime(a.ddoCertification.at), designation: a.ddoCertification.designation } } : {}),
    ...(a.secretaryApproval ? { secretary: a.secretaryApproval.byName } : {}),
    ...(a.presidentApproval ? { president: a.presidentApproval.byName } : {}),
  };
}

function fromMember(d: MemberDetail): F1 {
  const m = d.member;
  return {
    generalNo: m.generalNo,
    name: m.name,
    fatherName: m.fatherName,
    dob: m.dob,
    present: addr(m.presentAddress),
    permanent: addr(m.permanentAddress),
    mobile: m.mobileMasked,
    designation: m.designation,
    office: d.department?.name ?? '',
    appointment: m.doj,
    ...(m.employmentType === 'APPROVED_PROBATIONER' ? { probation: 'Approved probationer' } : {}),
    shares: m.numberOfShares,
    nominee: `${m.nominee.name} (${m.nominee.relation})${m.nominee.address ? `, ${m.nominee.address}` : ''}`,
    signedAt: `Member since ${formatDisplayDate(m.joinedSocietyOn)}`,
    ...(d.mandate?.agreedByName ? { ddo: { name: d.mandate.agreedByName, at: d.mandate.agreedOn ? formatDisplayDate(d.mandate.agreedOn) : '' } } : {}),
  };
}

export function MembershipFormPrintPage() {
  const [params, setParams] = useSearchParams();
  const appId = params.get('application');
  const memberId = params.get('member');
  const apps = useQuery({ queryKey: ['membership-list'], queryFn: api.applications.list, enabled: !appId && !memberId });
  const app = useQuery({ queryKey: ['membership', appId], queryFn: () => api.applications.get(appId!), enabled: Boolean(appId) });
  const mem = useQuery({ queryKey: ['member', memberId], queryFn: () => api.members.get(memberId!), enabled: Boolean(memberId) });
  if (!appId && !memberId)
    return (
      <>
        <Toolbar back="/reports" ready={false} />
        <Picker title="Membership application (F1)" description="Print from an application in progress, or from an existing member's record.">
          <div className="mb-4 max-w-md">
            <MemberSearch placeholder="Existing member: name or General No." onPick={(m) => setParams({ member: m.id })} />
          </div>
          <ViewState state={apps.isLoading ? 'loading' : 'ready'} layout="table">
            <PickList rows={(apps.data?.rows ?? []).filter((r) => r.status !== 'DRAFT').map((r) => ({ id: r.id, title: `${r.name} · ${r.applicationNo}`, subtitle: `${r.departmentName} · ${r.designation} · ${r.status.toLowerCase().replace(/_/g, ' ')}` }))} onPick={(id) => setParams({ application: id })} />
          </ViewState>
        </Picker>
      </>
    );
  const f = app.data ? fromApplication(app.data) : mem.data ? fromMember(mem.data) : undefined;
  const loading = app.isLoading || mem.isLoading;
  return (
    <>
      <Toolbar back="/reports/print/membership" backLabel="Choose another" ready={Boolean(f)} />
      <ViewState state={loading ? 'loading' : app.isError || mem.isError ? 'error' : 'ready'} layout="detail">
        {f && (
          <PrintSheet>
            <Letterhead />
            <FormTitle form="F1" title="APPLICATION FOR MEMBERSHIP" subtitle={[f.applicationNo && `Application ${f.applicationNo}`, f.generalNo && `General No. ${f.generalNo}`].filter(Boolean).join(' · ')} />
            <p className="mt-4 text-body">To, The Secretary, TGSECCSL. I request admission as a member of the society. My particulars are:</p>
            <div className="mt-3">
              <Line no="1" label="Name in full (block letters)" value={upper(f.name)} />
              <Line no="2" label="Father's name" value={f.fatherName} />
              <Line no="3" label="Date of birth" value={f.dob ? formatDisplayDate(f.dob) : ''} />
              <Line no="4" label="(a) Present address" value={f.present} />
              <Line label="(b) Permanent address" value={f.permanent} />
              <Line label="(c) Mobile number" value={f.mobile} />
              <Line no="5" label="Designation" value={f.designation} />
              <Line no="6" label="Office in which employed" value={f.office} />
              <Line no="7" label="(a) Date of regular appointment in the Secretariat Department" value={f.appointment ? formatDisplayDate(f.appointment) : ''} />
              <Line label="(b) If approved probationer, total service" value={f.probation ?? 'Not applicable'} />
              <Line no="8" label="No. of shares proposed to be taken" value={f.shares ? String(f.shares) : ''} />
              <Line no="9" label="Nominee (name, relationship, address) in the event of death" value={f.nominee} />
            </div>
            <div className="mt-4 text-body leading-relaxed">
              <p>I declare that (a) I accept the Bye-laws of the society as binding upon me; (b) I am not a member of any other co-operative credit society and no dues are payable by me to any such society.</p>
            </div>
            <Signatures items={[{ label: 'Signature of the applicant', ...(f.signedAt ? { name: f.name, at: f.signedAt } : {}) }, { label: 'Date', name: f.signedAt ? ' ' : '' }]} />
            <div className="mt-8 rounded border border-[#999] px-4 py-3 text-body">
              <p className="font-medium">CERTIFICATE</p>
              <p>Certified that the information against items 1 to 7 is correct.</p>
              <Signatures items={[{ label: `Asst. Secretary to Government${f.ddo?.designation ? ` · ${f.ddo.designation}` : ''}`, ...(f.ddo ? { name: f.ddo.name, at: f.ddo.at } : {}) }, { label: `Department: ${f.office}` }]} />
            </div>
            {(f.secretary || f.president) && <Signatures items={[{ label: 'Secretary', ...(f.secretary ? { name: f.secretary } : {}) }, { label: 'President', ...(f.president ? { name: f.president } : {}) }]} />}
            <p className="mt-6 text-[10px] text-[#777]">Digital twin of the society's white membership form. Signatures are recorded as Sign with OTP (D-031) and printed as "Signed".</p>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}

// ---- F2 / F3 Loan application ------------------------------------------------------------------

export function LoanFormPrintPage() {
  const [params, setParams] = useSearchParams();
  const loanId = params.get('loan');
  const product = params.get('product') ?? '';
  const list = useQuery({ queryKey: ['loans-print', product], queryFn: () => api.loans.list({ ...(product ? { product: product as 'SALARY' } : {}), pageSize: 25 }), enabled: !loanId });
  const q = useQuery({ queryKey: ['loan', loanId], queryFn: () => api.loans.get(loanId!), enabled: Boolean(loanId) });
  const member = useQuery({ queryKey: ['member', q.data?.member.id], queryFn: () => api.members.get(q.data!.member.id), enabled: Boolean(q.data) });
  if (!loanId)
    return (
      <>
        <Toolbar back="/reports" ready={false} />
        <Picker title="Loan application (F2 / F3)" description="Ordinary and Education loans print on the green F2 form; Salary loans on the white F3 slip.">
          <div className="mb-4">
            <Chips value={product || 'ALL'} options={[{ value: 'ALL', label: 'All loans' }, { value: 'ORDINARY', label: 'Ordinary' }, { value: 'EDUCATION', label: 'Education' }, { value: 'SALARY', label: 'Salary' }]} onChange={(v) => setParams(v === 'ALL' ? {} : { product: v })} />
          </div>
          <ViewState state={list.isLoading ? 'loading' : 'ready'} layout="table">
            <PickList rows={(list.data?.items ?? []).filter((l) => l.product !== 'DEPOSIT').map((l) => ({ id: l.id, title: `${l.memberName} · ${l.loanNo ?? l.applicationNo}`, subtitle: `${l.productName} · ${formatINR(l.appliedAmount)} · ${l.status.toLowerCase().replace(/_/g, ' ')}` }))} onPick={(id) => setParams({ loan: id })} />
          </ViewState>
        </Picker>
      </>
    );
  const d = q.data;
  return (
    <>
      <Toolbar back="/reports/print/loan-form" backLabel="Choose another loan" ready={Boolean(d)} />
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail">
        {d && (d.loan.product === 'SALARY' ? <F3 d={d} m={member.data} /> : <F2 d={d} m={member.data} />)}
      </ViewState>
    </>
  );
}

function F2({ d, m }: { d: LoanDetail; m?: MemberDetail }) {
  const l = d.loan;
  // Seeded historic loans have no captured form: fall back to the member's certified pay profile.
  const pp = m?.member.payProfile;
  const pay = l.form?.pay ?? (pp ? { scaleOfPay: pp.scaleOfPay, grossSalary: pp.grossSalary, govtLoanDeductions: pp.govtLoanDeductions, otherLoanDeductions: pp.otherLoanDeductions } : undefined);
  const deductions = (pay?.govtLoanDeductions ?? 0) + (pay?.otherLoanDeductions ?? 0);
  const amount = l.sanctionedAmount ?? l.appliedAmount;
  const ddo = l.signOffs?.ddo;
  return (
    <PrintSheet>
      <Letterhead />
      <FormTitle form="F2" title={`APPLICATION FOR ${l.product === 'EDUCATION' ? 'EDUCATION' : 'ORDINARY'} LOAN`} subtitle={`Application ${l.applicationNo}${l.loanNo ? ` · Loan ${l.loanNo}` : ''}`} />
      <div className="mt-4">
        <Line no="1" label="Name (block letters), address & mobile" value={`${upper(d.member.name)} · ${m ? addr(m.member.presentAddress) : ''} · ${d.member.mobileMasked}`} />
        <Line label="Genl. No." value={d.member.generalNo} />
        <Line no="2" label="Date of birth" value={formatDisplayDate(d.member.dob)} />
        <Line no="3" label="Date of retirement" value={`${formatDisplayDate(d.member.dor)} (${d.member.leftover.label} left)`} />
        <Line no="4" label="(a) Office in which employed" value={d.member.departmentName} />
        <Line label="(b) Designation" value={d.member.designation} />
        <Line label="(i) Scale of pay & pay" value={pay?.scaleOfPay ?? m?.member.payProfile.scaleOfPay} />
        <Line label="(ii) Total service in the officiating post" value={l.form?.pay?.officiatingServiceMonths !== undefined ? `${l.form.pay.officiatingServiceMonths} months` : ''} />
        <Line no="5" label="(a) Gross salary p.m." value={pay ? formatINR(pay.grossSalary) : ''} />
        <Line label="(b) Deductions towards Govt. loans" value={pay ? formatINR(pay.govtLoanDeductions) : ''} />
        <Line label="(c) Deductions towards other loans (excluding Society's loan)" value={pay ? formatINR(pay.otherLoanDeductions) : ''} />
        <Line label="(d) Total deductions" value={pay ? formatINR(deductions) : ''} />
        <Line label="(e) Net salary" value={pay ? formatINR(pay.grossSalary - deductions) : formatINR(d.preview.netSalary)} />
        <Line no="6" label="(a) No. of shares held / (b) paid-up value" value={m?.shares ? `${m.shares.numberOfShares} / ${formatINR(m.shares.shareCapital)}` : ''} />
        <Line label="(c) Additional shares proposed" value={l.form?.additionalShares !== undefined ? String(l.form.additionalShares) : 'Nil'} />
        <Line no="7" label="(a) Amount of loan required" value={`${formatINR(l.appliedAmount)} (${amountInWords(l.appliedAmount)})`} />
        <Line label="(b) Purpose of loan" value={l.form?.education ? `${l.purpose} · ${l.form.education.studentName} (${l.form.education.relation}), ${l.form.education.course}, ${l.form.education.institution}` : l.purpose} />
        <Line no="8" label="Nature of security tendered" value={l.form?.security ? `${l.form.security.type === 'SURETY' ? 'Sureties' : l.form.security.type === 'DEPOSIT_PLEDGE' ? 'Pledge of deposit' : 'Other'}${l.form.security.description ? `: ${l.form.security.description}` : ''}` : `${d.sureties.length} sureties`} />
      </div>
      <p className="mt-4 text-label">9. Particulars of sureties</p>
      <table className="mt-2 w-full text-[12px]">
        <thead>
          <tr className="[&_th]:border [&_th]:border-[#999] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
            <th>(a) Name</th>
            <th>(b) Genl. No.</th>
            <th>(c) Office</th>
            <th>(d) DOB</th>
            <th>(f) Designation</th>
            <th>(e) Pay</th>
            <th>(j) Shares</th>
            <th>(l) Retires during loan?</th>
          </tr>
        </thead>
        <tbody className="[&_td]:border [&_td]:border-[#999] [&_td]:px-2 [&_td]:py-1">
          {d.sureties.length ? (
            d.sureties.map((s) => (
              <tr key={s.memberId}>
                <td>{s.name}</td>
                <td>{s.generalNo}</td>
                <td>{s.departmentName}</td>
                <td>{formatDisplayDate(s.dob)}</td>
                <td>{s.designation}</td>
                <td className="tabular">{formatINR(s.substantivePay)}</td>
                <td>{s.numberOfShares}</td>
                <td>{s.checks.some((c) => c.ruleId === 'BR-024' && !c.pass) ? `Yes, ${formatDisplayDate(s.dor)}` : 'No'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>No sureties (security: {l.form?.security?.type === 'DEPOSIT_PLEDGE' ? 'pledged deposit' : 'as above'})</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-label">10. Other loans the sureties already guarantee</p>
      <p className="text-caption">
        {d.sureties.flatMap((s) => s.guarantees.map((g) => `${s.name}: ${g.product} of ${g.borrower} (${g.generalNo}), outstanding ${formatINR(g.outstanding)}`)).join(' · ') || 'Nil'}
      </p>
      <Line no="11" label="No. of monthly instalments (not exceeding 100)" value={String(l.sanctionedInstalments ?? l.appliedInstalments)} />
      <p className="mt-3 text-body leading-relaxed">
        12. We, the applicant and the sureties, jointly authorise the Drawing & Disbursing Officer and our future pay officers to recover the instalments of this loan from our salaries. On transfer, the new pay officer will recover as per the society's demand; on deputation, the sureties will inform the society of the applicant's address.
      </p>
      <Signatures items={[{ label: 'Applicant', ...(l.signature ? { name: d.member.name, at: formatDisplayDateTime(l.signature.signedAt) } : {}) }, ...d.sureties.slice(0, 2).map((s, i) => ({ label: `Surety ${i + 1}`, ...(s.status === 'ACCEPTED' && s.respondedAt ? { name: s.name, at: formatDisplayDateTime(s.respondedAt) } : {}) }))]} />
      <div className="mt-8 rounded border border-[#999] px-4 py-3 text-body">
        <p className="font-medium">CERTIFICATE</p>
        <p>Certified that the particulars from item 1 to 5 are true and correct.</p>
        <Signatures items={[{ label: ddo?.manual ? `${ddo.manual.designation} (paper certificate ${ddo.manual.reference})` : 'Asst. Secretary (DDO) / Section Officer (Claims)', ...(ddo ? { name: ddo.manual?.ddoName ?? ddo.byName, at: ddo.manual ? formatDisplayDate(ddo.manual.date) : formatDisplayDateTime(ddo.at) } : {}) }, { label: `Department: ${d.member.departmentName}` }]} />
      </div>
      <OfficeUse d={d} />
    </PrintSheet>
  );
}

function F3({ d, m }: { d: LoanDetail; m?: MemberDetail }) {
  const l = d.loan;
  const s = l.form?.salary;
  const deductions = (s?.compulsoryDeductions ?? []).reduce((a, x) => a + x.amount, 0);
  // F3 item 7: this month's instalments of the member's running Ordinary loans.
  const olDues = (m?.loans ?? []).filter((x) => x.product === 'ORDINARY' && x.status === 'ACTIVE').reduce((a, x) => a + (x.emi ?? 0), 0);
  return (
    <PrintSheet>
      <Letterhead />
      <FormTitle form="F3" title="APPLICATION FOR SALARY LOAN" subtitle={`Application ${l.applicationNo}${l.loanNo ? ` · Loan ${l.loanNo}` : ''}`} />
      <div className="mt-4">
        <Line no="1" label="Name" value={upper(d.member.name)} />
        <Line no="2" label="General Number" value={d.member.generalNo} />
        <Line no="3" label="Office in which employed" value={d.member.departmentName} />
        <Line no="4" label="Designation" value={d.member.designation} />
        <Line no="5" label="Substantive pay" value={s ? formatINR(s.substantivePay) : ''} />
        <Line no="6" label="Compulsory deductions from pay" value={(s?.compulsoryDeductions ?? []).map((x) => `${x.label} ${formatINR(x.amount)}`).join(', ') || 'Nil'} />
        <Line no="7" label="Payments due on Ordinary loans" value={formatINR(olDues)} />
        <Line no="8" label="Net substantive pay for the month (5 − 6 & 7)" value={s ? formatINR(s.substantivePay - deductions - olDues) : ''} />
        <Line no="9" label="Net pay earned up to date" value={s ? formatINR(s.netPayEarnedToDate) : ''} />
        <Line no="10" label="Amount of loan required" value={`${formatINR(l.appliedAmount)} (${amountInWords(l.appliedAmount)})`} />
        <Line no="11" label="Purpose (mention clearly)" value={l.purpose} />
      </div>
      <p className="mt-4 text-body">I hereby authorise the Pay Disbursing Officer to have the above loan recovered from my salary.</p>
      <Signatures items={[{ label: 'Signature of the applicant', ...(l.signature ? { name: d.member.name, at: formatDisplayDateTime(l.signature.signedAt) } : {}) }, { label: 'Date' }]} />
      <OfficeUse d={d} salary />
    </PrintSheet>
  );
}

function OfficeUse({ d, salary }: { d: LoanDetail; salary?: boolean }) {
  const l = d.loan;
  const sh = l.sanctionSheet;
  const so = l.signOffs;
  return (
    <div className="mt-8 border-t-2 border-dashed border-[#999] pt-4">
      <p className="text-center text-label tracking-widest">FOR OFFICE USE</p>
      {sh ? (
        <div className="mt-2 grid grid-cols-2 gap-x-8">
          <Line label="OL balance" value={`${formatINR(sh.balances.ordinary)}${sh.balances.ordinaryTakenOn ? ` · taken ${formatDisplayDate(sh.balances.ordinaryTakenOn)}` : ''}`} />
          <Line label="SL balance" value={`${formatINR(sh.balances.salary)}${sh.balances.salaryTakenOn ? ` · taken ${formatDisplayDate(sh.balances.salaryTakenOn)}` : ''}`} />
          <Line label="Interest to date" value={sh.topup ? formatINR(sh.topup.accruedInterest) : 'Nil'} />
          <Line label="Total loans balance" value={formatINR(sh.balances.ordinary + sh.balances.salary)} />
          <Line label="Sanctioned" value={`${formatINR(sh.amount)} · ${sh.instalments} months @ ${sh.ratePercent}%`} />
          <Line label="EMI / first due" value={`${formatINR(sh.emi)} from ${formatCycle(sh.firstDueCycle)}`} />
          {!salary && <Line label="Share deposit kept" value={formatINR(sh.shareDeduction)} />}
          <Line label="Net payable" value={formatINR(sh.netDisbursable)} />
        </div>
      ) : (
        <p className="mt-2 text-caption text-[#555]">Not assessed yet.</p>
      )}
      <Signatures
        items={[
          { label: 'Accountant (assessed)', ...(so?.assessment ? { name: so.assessment.byName, at: formatDisplayDateTime(so.assessment.at) } : {}) },
          { label: 'Secretary (sanctioned)', ...(so?.secretary ? { name: so.secretary.byName, at: formatDisplayDateTime(so.secretary.at) } : {}) },
          { label: 'President (sanctioned)', ...(so?.president ? { name: so.president.byName, at: formatDisplayDateTime(so.president.at) } : {}) },
        ]}
      />
    </div>
  );
}

// ---- F4 Fixed deposit application ---------------------------------------------------------------

export function FdFormPrintPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('deposit');
  const list = useQuery({ queryKey: ['deposits-print'], queryFn: () => api.deposits.list({ tab: 'FD', pageSize: 25 }), enabled: !id });
  const q = useQuery({ queryKey: ['deposit', id], queryFn: () => api.deposits.get(id!), enabled: Boolean(id) });
  if (!id)
    return (
      <>
        <Toolbar back="/reports" ready={false} />
        <Picker title="Fixed deposit application (F4)" description="The green F4 form with the cash slip. Active deposits also have the FD receipt (FDR).">
          <ViewState state={list.isLoading ? 'loading' : 'ready'} layout="table">
            <PickList rows={(list.data?.items ?? []).filter((r) => r.scheme === 'FD').map((r) => ({ id: r.id, title: `${r.memberName} · ${r.fdrNo ?? r.accountNo}`, subtitle: `${r.status.toLowerCase().replace(/_/g, ' ')} · ${r.departmentName}` }))} onPick={(x) => setParams({ deposit: x })} />
          </ViewState>
        </Picker>
      </>
    );
  const d = q.data;
  const dep = d?.deposit;
  return (
    <>
      <Toolbar back="/reports/print/fd-form" backLabel="Choose another deposit" ready={Boolean(d)}>
        {dep?.fdrNo && <ButtonV2 text="Open FDR" buttonType={ButtonV2Type.SECONDARY} onClick={() => navigate(`/deposits/${dep.id}/fdr`)} />}
      </Toolbar>
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail">
        {d && dep && (
          <PrintSheet>
            <Letterhead />
            <FormTitle form="F4" title="APPLICATION FOR FIXED DEPOSIT" subtitle={`Request ${dep.accountNo}`} />
            <div className="mt-4">
              <Line no="1" label="Name of depositor in full" value={upper(d.member.name)} />
              <Line no="2" label="Father's / Husband's name" value={d.member.fatherName} />
              <Line no="3" label="Profession or occupation" value={`${d.member.designation}, ${d.member.departmentName}`} />
              <Line no="4" label="Phone" value={d.member.mobileMasked} />
              <Line no="5" label="Amount of deposit" value={`${formatINR(dep.principal ?? 0)} (${amountInWords(dep.principal ?? 0)})`} />
              <Line no="6" label="Period of deposit" value={dep.tenureMonths ? `${dep.tenureMonths} months` : ''} />
              <Line no="7" label="Rate of interest p.a." value={`${dep.ratePercent}%`} />
              <Line no="8" label="Interest payable" value={PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY']} />
              <Line no="9" label="Nominee (name, address, relationship)" value={dep.nominee ? `${dep.nominee.name}, ${dep.nominee.relation}${dep.nominee.address ? `, ${dep.nominee.address}` : ''}` : ''} />
              {dep.holders?.length ? <Line label="Joint holders" value={`${dep.holders.map((h) => h.name).join(', ')} · ${dep.operationMode === 'ANY_ONE_OR_SURVIVOR' ? 'any one or survivor' : 'either or survivor'}`} /> : null}
              {dep.minor ? <Line label="Minor (guardian's declaration)" value={`${dep.minor.name}, born ${formatDisplayDate(dep.minor.dob)}; guardian ${dep.minor.guardianName}`} /> : null}
            </div>
            <ol className="mt-4 list-decimal pl-6 text-caption leading-relaxed">
              <li>The society is not bound to give notice of the date of maturity.</li>
              <li>Interest ceases from the date fixed for repayment.</li>
              <li>Payment to either or the survivor (two persons) or any one or the survivor (three or more) completely discharges the society.</li>
              <li>Renewal in the name of either or survivor, or any one, has the same effect.</li>
            </ol>
            <p className="mt-2 text-body">I/We agree to abide by the rules relating to fixed deposits.</p>
            <Signatures items={[{ label: 'Signature of depositor(s)', ...(dep.signature ? { name: d.member.name, at: formatDisplayDateTime(dep.signature.signedAt) } : {}) }, { label: 'Date' }]} />
            <div className="mt-6 grid grid-cols-2 gap-6 border-t-2 border-dashed border-[#999] pt-4">
              <div>
                <p className="text-label">FOR OFFICE USE</p>
                <Line label="Account No." value={dep.status === 'ACTIVE' || dep.fdrNo ? dep.accountNo : ''} />
                <Line label="F.D.R. No." value={dep.fdrNo} />
                <Signatures items={[{ label: 'Secretary (accepted)', ...(dep.signOffs?.secretary ? { name: dep.signOffs.secretary.byName } : {}) }, { label: 'President (accepted)', ...(dep.signOffs?.president ? { name: dep.signOffs.president.byName } : {}) }]} />
              </div>
              <div className="rounded border border-[#999] p-3">
                <p className="text-label">CASH SLIP</p>
                <p className="text-caption">
                  Received {dep.payment?.mode === 'CASH' ? 'cash' : dep.payment ? `by ${dep.payment.mode.toLowerCase()}` : ''} from Sri {d.member.name} towards deposit{dep.payment ? `: ${formatINR(dep.payment.amount)}, receipt ${dep.payment.receiptNo}` : ''}.
                </p>
                <table className="mt-2 w-full text-[12px]">
                  <tbody className="[&_td]:border [&_td]:border-[#bbb] [&_td]:px-2 [&_td]:py-0.5">
                    {([500, 200, 100, 50, 20, 10] as const).map((n) => {
                      const c = dep.payment?.denominations?.[n] ?? 0;
                      return (
                        <tr key={n}>
                          <td>₹{n} ×</td>
                          <td className="tabular text-right">{c || ''}</td>
                          <td className="tabular text-right">{c ? formatINR(c * n * 100) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-caption">Cashier: {dep.payment?.byName ?? ''}</p>
              </div>
            </div>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}

// ---- F5 / F6 Recovery agreements ----------------------------------------------------------------

export function AgreementPrintPage() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get('member');
  const version = params.get('version') === 'A' ? 'A' : 'B';
  const q = useQuery({ queryKey: ['member', memberId], queryFn: () => api.members.get(memberId!), enabled: Boolean(memberId) });
  if (!memberId)
    return (
      <>
        <Toolbar back="/reports" ready={false} />
        <Picker title="Recovery agreement (F5 / F6)" description="The salary recovery authorisation each member signs: version A to the Secretary, version B to the pay disbursing officer, countersigned AGREED by the DDO.">
          <div className="max-w-md">
            <MemberSearch placeholder="Member: name or General No." onPick={(m) => setParams({ member: m.id })} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-caption text-fg-tertiary">
            <UserRound size={14} aria-hidden /> Also printed from Members → profile → Agreements.
          </p>
        </Picker>
      </>
    );
  const d = q.data;
  const m = d?.member;
  const mandate = d?.mandate;
  return (
    <>
      <Toolbar back="/reports/print/agreement" backLabel="Choose another member" ready={Boolean(d)}>
        <Chips value={version} options={[{ value: 'A', label: 'F5 · to the Secretary' }, { value: 'B', label: 'F6 · to the pay officer' }]} onChange={(v) => setParams({ member: memberId, version: v })} />
      </Toolbar>
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="detail">
        {d && m && (
          <PrintSheet>
            <Letterhead />
            <FormTitle form={version === 'A' ? 'F5' : 'F6'} title="AGREEMENT WITH THE SOCIETY" subtitle={version === 'A' ? 'To the Secretary, TGSECCSL' : `To the Asst. / Deputy Secretary to Government, ${d.department?.name ?? ''}`} />
            <p className="mt-5 text-body leading-relaxed">
              I, <strong>{m.name}</strong>, {m.designation}, {d.department?.name}, General No. {m.generalNo}, a member of The Telangana Secretariat Employees Co-operative Credit Society Ltd.,{' '}
              {version === 'A' ? (
                <>
                  hereby authorise the society to recover from my monthly salary the instalments of loans and all other sums due by me to the society, <strong>whether as borrower or as surety</strong>. I further agree that any sum remaining unpaid at my retirement, or on my death earlier, shall be recovered from my <strong>gratuity</strong> and other dues payable to me.
                </>
              ) : (
                <>
                  hereby authorise you and the pay disbursing officers who succeed you to recover from my salary, on the demand of the society, the instalments of loans, the <strong>thrift deposit</strong> and all other sums due by me. A demand certified by an officer of the society shall be conclusive evidence of my liability, and the recovery shall not be suspended at my request. Sums unpaid at my retirement or death shall be recovered from my gratuity. On my transfer out of the Secretariat a copy of this agreement shall be sent to my new pay officer, who shall recover as per the society's demand list.
                </>
              )}
            </p>
            <Signatures items={[{ label: 'Signature of the member', name: m.name, ...(mandate ? { at: `Signed ${formatDisplayDate(mandate.signedOn)}` } : {}) }, { label: 'Witness' }]} />
            {version === 'B' && (
              <div className="mt-8 rounded border border-[#999] px-4 py-3">
                <p className="text-center text-card-title tracking-[0.3em]">AGREED</p>
                <Signatures items={[{ label: `Asst. / Deputy Secretary to Govt., ${d.department?.name ?? ''}`, ...(mandate?.agreedByName ? { name: mandate.agreedByName, ...(mandate.agreedOn ? { at: formatDisplayDate(mandate.agreedOn) } : {}) } : {}) }, { label: mandate ? `Mandate ${mandate.status === 'AGREED' ? 'agreed' : mandate.status === 'PENDING_NEW_DDO' ? 'waiting for the new DDO' : 'superseded'}` : 'No mandate on file' }]} />
              </div>
            )}
            <p className="mt-6 text-[10px] text-[#777]">The printed paper form still names the legacy "Andhra Pradesh Secretariat Staff Co-operative Society Ltd."; this text is updated and needs legal review (Q-505).</p>
          </PrintSheet>
        )}
      </ViewState>
    </>
  );
}
