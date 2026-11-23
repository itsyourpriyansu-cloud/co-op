// D-133: the office copies staff print from the phone, the same wording as the console's printable twins
// (apps/admin-console/src/pages/reports/PrintForms.tsx, BondPrints.tsx, SettlementPage.tsx, DemandSheetPage.tsx).
// Pure HTML builders, like lib/documents.ts; signatures are placeholders that `withSignatures` fills in.
// shortcut: the console keeps its own React copies of these layouts; move both to one shared package if they drift.
import { amountInWords, formatBankAccount, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { Address, DefaulterNotice, DemandHead, DemandSheetDetail, DepositDetail, LoanDetail, MemberDetail, MembershipDetail, OfficeVoucher, ReportCell, ReportColumn, ReportResult, SettlementView } from '@tgs/types';
import { esc, page, sigImg, type Society } from './documents';

type Opts = { society: Society; generatedOn: string };
type Slot = { label: string; name?: string; at?: string; fileId?: string; value?: string };

const addr = (a?: Partial<Address>) => (a ? [a.line1, a.line2, a.city, a.district].filter(Boolean).join(', ') + (a.pincode ? ` - ${a.pincode}` : '') : '');
const PAYOUT: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', HALF_YEARLY: 'Half-yearly', ON_MATURITY: 'On maturity' };
const ON_PAPER = 'On paper, before the app';
const SANCTIONED_OR_LATER = ['SANCTIONED', 'ACTIVE', 'CLOSED', 'CLOSED_BY_TOPUP'];

/** "3. Date of Birth ........ 12 Mar 1982" */
const ln = (label: string, value?: string, no?: string) => `<div class="ln"><span class="no">${no ? `${esc(no)}.` : ''}</span><span class="lb">${esc(label)}</span><span class="v">${esc(value ?? '')}</span></div>`;
const title = (form: string, heading: string, subtitle?: string) => `<p class="form">FORM ${esc(form)}</p><h2 style="margin:2px 0">${esc(heading)}</h2>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}`;
/** One signature line: the image when on file, else the name, else a value written on the line. */
const sigs = (items: Slot[]) =>
  `<div class="sigs">${items
    .map((s) => `<div><div class="line">${s.fileId && s.name ? sigImg(s.fileId) : s.value ? `<span style="font-style:normal">${esc(s.value)}</span>` : s.name ? `Signed: ${esc(s.name)}` : ''}</div><b>${esc(s.label)}</b>${s.at ? `<br><span class="small">${esc(s.at)}</span>` : ''}</div>`)
    .join('')}</div>`;
const orPaper = (s: Slot, done: boolean): Slot => (done && !s.name && !s.value ? { ...s, value: ON_PAPER } : s);
const signOff = (label: string, so?: { byName: string; at: string; signatureFileId?: string }): Slot => ({ label, ...(so ? { name: so.byName, at: formatDisplayDateTime(so.at), ...(so.signatureFileId ? { fileId: so.signatureFileId } : {}) } : {}) });

// ---- F1 membership --------------------------------------------------------------------------

type F1 = { applicationNo?: string; generalNo?: string; name: string; fatherName: string; dob?: string; present: string; permanent: string; mobile: string; designation: string; office: string; appointment?: string; probation?: string; shares?: number; nominee: string; applicant: Slot; date?: string; ddo: Slot; secretary?: Slot; president?: Slot };

/** F1 from an application in progress (ST-15). */
export function membershipFromApplication(d: MembershipDetail): F1 {
  const a = d.application;
  const f = a.form ?? {};
  const c = a.ddoCertification;
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
    applicant: { label: 'Signature of the applicant', ...(a.signature ? { name: f.personal?.fullName ?? a.name, at: formatDisplayDateTime(a.signature.signedAt), ...(a.signature.fileId ? { fileId: a.signature.fileId } : {}) } : {}) },
    ...(a.signature ? { date: formatDisplayDate(a.signature.signedAt.slice(0, 10)) } : {}),
    ddo: { label: c?.designation || 'Asst. Secretary to Government', ...(c ? { name: c.byName, at: formatDisplayDateTime(c.at), ...(c.signatureFileId ? { fileId: c.signatureFileId } : {}) } : {}) },
    ...(a.secretaryApproval ? { secretary: signOff('Secretary', a.secretaryApproval) } : {}),
    ...(a.presidentApproval ? { president: signOff('President', a.presidentApproval) } : {}),
  };
}

/** F1 reprinted from a member's record (ST-12). */
export function membershipFromMember(d: MemberDetail): F1 {
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
    applicant: { label: 'Signature of the applicant', name: m.name, at: `Member since ${formatDisplayDate(m.joinedSocietyOn)}` },
    date: formatDisplayDate(m.joinedSocietyOn),
    ddo: { label: 'Asst. Secretary to Government', ...(d.mandate?.agreedByName ? { name: d.mandate.agreedByName, at: d.mandate.agreedOn ? formatDisplayDate(d.mandate.agreedOn) : '' } : {}) },
  };
}

export function membershipFormHtml(f: F1, o: Opts): string {
  const body = `${title('F1', 'APPLICATION FOR MEMBERSHIP', [f.applicationNo && `Application ${f.applicationNo}`, f.generalNo && `General No. ${f.generalNo}`].filter(Boolean).join(' · '))}
<p>To, The Secretary, ${esc(o.society.shortName)}. I request admission as a member of the society. My particulars are:</p>
${ln('Name in full (block letters)', f.name.toUpperCase(), '1')}${ln("Father's name", f.fatherName, '2')}${ln('Date of birth', f.dob ? formatDisplayDate(f.dob) : '', '3')}${ln('(a) Present address', f.present, '4')}${ln('(b) Permanent address', f.permanent)}${ln('(c) Mobile number', f.mobile)}${ln('Designation', f.designation, '5')}${ln('Office in which employed', f.office, '6')}${ln('(a) Date of regular appointment in the Secretariat Department', f.appointment ? formatDisplayDate(f.appointment) : '', '7')}${ln('(b) If approved probationer, total service', f.probation ?? 'Not applicable')}${ln('No. of shares proposed to be taken', f.shares ? String(f.shares) : '', '8')}${ln('Nominee (name, relationship, address) in the event of death', f.nominee, '9')}
<p>I declare that (a) I accept the Bye-laws of the society as binding upon me; (b) I am not a member of any other co-operative credit society and no dues are payable by me to any such society.</p>
${sigs([f.applicant, { label: 'Date', ...(f.date ? { value: f.date } : {}) }])}
<div class="box"><b>CERTIFICATE</b><br>Certified that the information against items 1 to 7 is correct.${sigs([f.ddo, { label: 'Department', ...(f.office ? { value: f.office } : {}) }])}</div>
${f.secretary || f.president ? sigs([f.secretary ?? { label: 'Secretary' }, f.president ?? { label: 'President' }]) : ''}`;
  return page(`F1 ${f.applicationNo ?? f.generalNo ?? ''}`, o.society, body, o.generatedOn, 'office');
}

// ---- F2 / F3 loan application ---------------------------------------------------------------

function officeUse(d: LoanDetail, salary: boolean): string {
  const l = d.loan;
  const sh = l.sanctionSheet;
  const so = l.signOffs;
  const done = SANCTIONED_OR_LATER.includes(l.status);
  const sheet = sh
    ? `${ln('OL balance', `${formatINR(sh.balances.ordinary)}${sh.balances.ordinaryTakenOn ? ` · taken ${formatDisplayDate(sh.balances.ordinaryTakenOn)}` : ''}`)}${ln('SL balance', `${formatINR(sh.balances.salary)}${sh.balances.salaryTakenOn ? ` · taken ${formatDisplayDate(sh.balances.salaryTakenOn)}` : ''}`)}${ln('Interest to date', sh.topup ? formatINR(sh.topup.accruedInterest) : 'Nil')}${ln('Total loans balance', formatINR(sh.balances.ordinary + sh.balances.salary))}${ln('Surety recoveries', sh.balances.suretyRecoveries ? formatINR(sh.balances.suretyRecoveries) : 'Nil')}${ln('Sanctioned', `${formatINR(sh.amount)} · ${sh.instalments} months @ ${sh.ratePercent}%`)}${ln('EMI / first due', `${formatINR(sh.emi)} from ${formatCycle(sh.firstDueCycle)}`)}${sh.earlyInterest ? ln('Interest before first due', formatINR(sh.earlyInterest)) : ''}${salary ? '' : ln('Share deposit kept', formatINR(sh.shareDeduction))}${ln('Net payable', formatINR(sh.netDisbursable))}`
    : `<p class="small">${['SANCTION_SECRETARY', 'SANCTION_PRESIDENT', ...SANCTIONED_OR_LATER].includes(l.status) ? 'Assessed before this system was used: the office-use details are in the society register.' : 'Not assessed yet.'}</p>`;
  return `<div class="office"><p style="text-align:center;letter-spacing:3px"><b>FOR OFFICE USE</b></p>${sheet}${sigs([signOff('Accountant (assessed)', so?.assessment), signOff('Secretary (sanctioned)', so?.secretary), signOff('President (sanctioned)', so?.president)].map((s) => orPaper(s, done)))}</div>`;
}

const bankLine = (d: LoanDetail) => ln('Pay the loan into (bank account)', d.loan.form?.bankAccount ? formatBankAccount(d.loan.form.bankAccount) : '');

/** F2 (Ordinary / Education) or F3 (Salary). `m` adds the address, shares and Ordinary-loan dues. */
export function loanFormHtml(d: LoanDetail, m: MemberDetail | undefined, o: Opts): string {
  const l = d.loan;
  const sub = `Application ${l.applicationNo}${l.loanNo ? ` · Loan ${l.loanNo}` : ''}`;
  const applicant: Slot = { label: 'Signature of the applicant', ...(l.signature ? { name: d.member.name, at: formatDisplayDateTime(l.signature.signedAt), ...(l.signature.fileId ? { fileId: l.signature.fileId } : {}) } : {}) };
  let body: string;
  if (l.product === 'SALARY') {
    const s = l.form?.salary;
    const deductions = (s?.compulsoryDeductions ?? []).reduce((a, x) => a + x.amount, 0);
    const olDues = (m?.loans ?? []).filter((x) => x.product === 'ORDINARY' && x.status === 'ACTIVE').reduce((a, x) => a + (x.emi ?? 0), 0);
    body = `${title('F3', 'APPLICATION FOR SALARY LOAN', sub)}
${ln('Name', d.member.name.toUpperCase(), '1')}${ln('General Number', d.member.generalNo, '2')}${ln('Office in which employed', d.member.departmentName, '3')}${ln('Designation', d.member.designation, '4')}${ln('Substantive pay', s ? formatINR(s.substantivePay) : '', '5')}${ln('Compulsory deductions from pay', (s?.compulsoryDeductions ?? []).map((x) => `${x.label} ${formatINR(x.amount)}`).join(', ') || 'Nil', '6')}${ln('Payments due on Ordinary loans', formatINR(olDues), '7')}${ln('Net substantive pay for the month (5 − 6 & 7)', s ? formatINR(s.substantivePay - deductions - olDues) : '', '8')}${ln('Net pay earned up to date', s ? formatINR(s.netPayEarnedToDate) : '', '9')}${ln('Amount of loan required', `${formatINR(l.appliedAmount)} (${amountInWords(l.appliedAmount)})`, '10')}${ln('Purpose (mention clearly)', l.purpose, '11')}${bankLine(d)}
<p>I hereby authorise the Pay Disbursing Officer to have the above loan recovered from my salary.</p>
${sigs([applicant, { label: 'Date', ...(l.signature ? { value: formatDisplayDate(l.signature.signedAt.slice(0, 10)) } : {}) }])}${officeUse(d, true)}`;
  } else {
    const pay = l.form?.pay;
    const ded = pay ? pay.govtLoanDeductions + pay.otherLoanDeductions : 0;
    const ddo = l.signOffs?.ddo;
    const heading = l.product === 'EDUCATION' ? 'EDUCATION LOAN' : l.product === 'ORDINARY' ? 'ORDINARY LOAN' : d.product.name.toUpperCase();
    const security = l.form?.security ? `${l.form.security.type === 'SURETY' ? 'Sureties' : l.form.security.type === 'DEPOSIT_PLEDGE' ? 'Pledge of deposit' : 'Other'}${l.form.security.description ? `: ${l.form.security.description}` : ''}` : `${d.sureties.length} sureties`;
    const sureties = d.sureties.length
      ? d.sureties.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.generalNo)}</td><td>${esc(s.departmentName)}</td><td>${esc(formatDisplayDate(s.dob))}</td><td>${esc(s.designation)}</td><td class="n">${esc(formatINR(s.substantivePay))}</td><td>${s.numberOfShares}</td><td>${s.checks.some((c) => c.ruleId === 'BR-024' && !c.pass) ? `Yes, ${esc(formatDisplayDate(s.dor))}` : 'No'}</td></tr>`).join('')
      : `<tr><td colspan="8">No sureties</td></tr>`;
    body = `${title('F2', `APPLICATION FOR ${heading}`, sub)}
${ln('Name (block letters), address & mobile', `${d.member.name.toUpperCase()} · ${m ? addr(m.member.presentAddress) : ''} · ${d.member.mobileMasked}`, '1')}${ln('Genl. No.', d.member.generalNo)}${ln('Date of birth', formatDisplayDate(d.member.dob), '2')}${ln('Date of retirement', `${formatDisplayDate(d.member.dor)} (${d.member.leftover.label} left)`, '3')}${ln('(a) Office in which employed', d.member.departmentName, '4')}${ln('(b) Designation', d.member.designation)}${ln('(i) Scale of pay & pay', pay?.scaleOfPay ?? m?.member.payProfile.scaleOfPay)}${ln('(a) Gross salary p.m.', pay ? formatINR(pay.grossSalary) : '', '5')}${ln('(b) Deductions towards Govt. loans', pay ? formatINR(pay.govtLoanDeductions) : '')}${ln("(c) Deductions towards other loans (excluding Society's loan)", pay ? formatINR(pay.otherLoanDeductions) : '')}${ln('(d) Total deductions', pay ? formatINR(ded) : '')}${ln('(e) Net salary', pay ? formatINR(pay.grossSalary - ded) : formatINR(d.preview.netSalary))}${ln('(a) No. of shares held / (b) paid-up value', m?.shares ? `${m.shares.numberOfShares} / ${formatINR(m.shares.shareCapital)}` : '', '6')}${ln('(c) Additional shares proposed', l.form?.additionalShares !== undefined ? String(l.form.additionalShares) : 'Nil')}${ln('(a) Amount of loan required', `${formatINR(l.appliedAmount)} (${amountInWords(l.appliedAmount)})`, '7')}${ln('(b) Purpose of loan', l.form?.education ? `${l.purpose} · ${l.form.education.studentName} (${l.form.education.relation}), ${l.form.education.course}, ${l.form.education.institution}` : l.purpose)}${ln('Nature of security tendered', security, '8')}
<p><b>9. Particulars of sureties</b></p>
<table class="grid"><thead><tr><th>Name</th><th>Genl. No.</th><th>Office</th><th>DOB</th><th>Designation</th><th class="n">Pay</th><th>Shares</th><th>Retires during loan?</th></tr></thead><tbody>${sureties}</tbody></table>
<p><b>10. Other loans the sureties already guarantee:</b> ${esc(d.sureties.flatMap((s) => s.guarantees.map((g) => `${s.name}: ${g.product} of ${g.borrower} (${g.generalNo}), outstanding ${formatINR(g.outstanding)}`)).join(' · ') || 'Nil')}</p>
${ln('No. of monthly instalments (not exceeding 100)', String(l.sanctionedInstalments ?? l.appliedInstalments), '11')}${bankLine(d)}
<p>12. We, the applicant and the sureties, jointly authorise the Drawing &amp; Disbursing Officer and our future pay officers to recover the instalments of this loan from our salaries. On transfer, the new pay officer will recover as per the society's demand; on deputation, the sureties will inform the society of the applicant's address.</p>
${sigs([
  { ...applicant, label: 'Applicant' },
  ...d.sureties.slice(0, 2).map((s, i): Slot => {
    const fileId = l.sureties.find((x) => x.memberId === s.memberId)?.signatureFileId;
    return { label: `Surety ${i + 1}`, ...(s.status === 'ACCEPTED' && s.respondedAt ? { name: s.name, at: formatDisplayDateTime(s.respondedAt), ...(fileId ? { fileId } : {}) } : {}) };
  }),
])}
<div class="box"><b>CERTIFICATE</b><br>Certified that the particulars from item 1 to 5 are true and correct.${sigs([
      { label: ddo?.manual ? `${ddo.manual.designation} (paper certificate ${ddo.manual.reference})` : 'Asst. Secretary (DDO) / Section Officer (Claims)', ...(ddo ? { name: ddo.manual?.ddoName ?? ddo.byName, at: ddo.manual ? formatDisplayDate(ddo.manual.date) : formatDisplayDateTime(ddo.at), ...(ddo.signatureFileId ? { fileId: ddo.signatureFileId } : {}) } : {}) },
      { label: 'Department', value: d.member.departmentName },
    ])}</div>${officeUse(d, false)}`;
  }
  return page(`Loan form ${l.applicationNo}`, o.society, body, o.generatedOn, 'office');
}

// ---- F7–F9 bond and receipt -----------------------------------------------------------------

export function loanBondHtml(d: LoanDetail, o: Opts): string {
  const l = d.loan;
  const salary = l.product === 'SALARY';
  const amount = l.sanctionedAmount ?? l.appliedAmount;
  const received = l.disbursement?.amount ?? 0;
  const dept = `${d.member.designation}, ${d.member.departmentName}`;
  const heading = salary ? 'SALARY LOAN BOND' : l.product === 'ORDINARY' || l.product === 'EDUCATION' ? 'ORDINARY LOAN / EDUCATION LOAN BOND' : `${d.product.name.toUpperCase()} BOND`;
  const borrower: Slot = { label: "Borrower's signature", ...(l.signature ? { name: d.member.name, ...(l.signature.fileId ? { fileId: l.signature.fileId } : {}) } : {}), at: `${d.member.name.toUpperCase()} · ${dept}` };
  const sureties = salary
    ? ''
    : d.sureties.length
      ? `<p><b>Surety:</b></p>${sigs(
          d.sureties.map((s): Slot => {
            const raw = l.sureties.find((x) => x.memberId === s.memberId);
            const signed = raw?.status === 'ACCEPTED';
            return { label: 'Signature', ...(signed ? { name: s.name, ...(raw?.signatureFileId ? { fileId: raw.signatureFileId } : {}) } : {}), at: `(${s.name.toUpperCase()}) · G.No. ${s.generalNo} · ${s.designation}, ${s.departmentName}` };
          }),
        )}`
      : '';
  const ack: Slot = { label: 'Signature', ...(l.receiptAck ? { name: d.member.name, ...(l.receiptAck.fileId ? { fileId: l.receiptAck.fileId } : {}) } : {}) };
  const body = `<p class="small">G.I. No. ${esc(d.member.generalNo)} · Dept. ${esc(d.member.departmentName)} · Posted in Folio No. ${esc(l.loanNo ?? '—')} · Vol. No. ${esc((l.disbursedOn ?? l.appliedOn).slice(0, 4))}${salary ? '' : ` · L. No. ${esc(l.loanNo ?? l.applicationNo)}`}</p>
<h2>${esc(heading)}</h2>
<p>ON DEMAND ${salary ? 'I promise' : 'we jointly and severally promise'} to pay the Telangana Secretariat Employees Cooperative Credit Society Ltd., Hyderabad, or order the sum of <b>${esc(formatINR(amount))}</b> (Rupees ${esc(amountInWords(amount))} only) for value received in cash with interest ${salary ? 'thereon ' : ''}from the date hereof until payment in full at the rate of <b>${esc(l.ratePercent)}%</b> per annum calculated at monthly rates.</p>
<p>Rs. ${esc(formatINR(amount))} · Date: ${esc(l.signature ? formatDisplayDate(l.signature.signedAt.slice(0, 10)) : '—')}</p>
${sigs([borrower])}${sureties}
<div class="office">
<p>Received from the T.G. Secretariat Employees Cooperative Credit Society Ltd., the sum of <b>${esc(formatINR(received))}</b> (Rupees ${esc(received ? amountInWords(received) : '—')} only) being ${salary ? 'salary' : l.product === 'EDUCATION' ? 'education' : 'ordinary'} loan.</p>
<p>Date: ${esc(l.disbursement ? formatDisplayDate(l.disbursement.date) : '—')}</p>${sigs([ack])}
<p class="small">N.B.: In the case of authorisation please sign this also. Please pay the above amount to Sri ${esc(l.disbursement?.payee ?? '…………………………')} and oblige.</p>
<p>Verified · Account / Manager: ${esc(l.signOffs?.review?.byName ?? '')}</p>
<p>Received Rupees ${esc(received ? formatINR(received) : '')} · Name &amp; G.I. No.: ${esc(d.member.name)}, ${esc(d.member.generalNo)} · ${esc(dept)}</p>
${l.disbursement ? '<p style="text-align:center"><b>"PAID"</b></p>' : ''}${sigs([signOff('Cashier', l.disbursement ? { byName: l.disbursement.byName, at: l.disbursement.at, ...(l.disbursement.signatureFileId ? { signatureFileId: l.disbursement.signatureFileId } : {}) } : undefined)])}
</div>`;
  return page(`Bond ${l.loanNo ?? l.applicationNo}`, o.society, body, o.generatedOn, 'office');
}

// ---- F4 fixed deposit -----------------------------------------------------------------------

export function fdFormHtml(d: DepositDetail, o: Opts): string {
  const dep = d.deposit;
  const p = dep.payment;
  const issued = Boolean(dep.fdrNo);
  const slip = ([500, 200, 100, 50, 20, 10] as const)
    .map((n) => {
      const c = p?.denominations?.[n] ?? 0;
      return `<tr><td>₹${n} ×</td><td class="n">${c || ''}</td><td class="n">${c ? esc(formatINR(c * n * 100)) : ''}</td></tr>`;
    })
    .join('');
  const body = `${title('F4', 'APPLICATION FOR FIXED DEPOSIT', `Request ${dep.accountNo}`)}
${ln('Name of depositor in full', d.member.name.toUpperCase(), '1')}${ln("Father's / Husband's name", d.member.fatherName, '2')}${ln('Profession or occupation', `${d.member.designation}, ${d.member.departmentName}`, '3')}${ln('Phone', d.member.mobileMasked, '4')}${ln('Amount of deposit', `${formatINR(dep.principal ?? 0)} (${amountInWords(dep.principal ?? 0)})`, '5')}${ln('Period of deposit', dep.tenureMonths ? `${dep.tenureMonths} months` : '', '6')}${ln('Rate of interest p.a.', `${dep.ratePercent}%`, '7')}${ln('Interest payable', PAYOUT[dep.payoutFrequency ?? 'ON_MATURITY'], '8')}${ln('Nominee (name, address, relationship)', dep.nominee ? `${dep.nominee.name}, ${dep.nominee.relation}${dep.nominee.address ? `, ${dep.nominee.address}` : ''}` : '', '9')}${dep.holders?.length ? ln('Joint holders', `${dep.holders.map((h) => h.name).join(', ')} · ${dep.operationMode === 'ANY_ONE_OR_SURVIVOR' ? 'any one or survivor' : 'either or survivor'}`) : ''}${dep.minor ? ln("Minor (guardian's declaration)", `${dep.minor.name}, born ${formatDisplayDate(dep.minor.dob)}; guardian ${dep.minor.guardianName}`) : ''}
<ol class="small"><li>The society is not bound to give notice of the date of maturity.</li><li>Interest ceases from the date fixed for repayment.</li><li>Payment to either or the survivor (two persons) or any one or the survivor (three or more) completely discharges the society.</li><li>Renewal in the name of either or survivor, or any one, has the same effect.</li></ol>
<p>I/We agree to abide by the rules relating to fixed deposits.</p>
${sigs([{ label: 'Signature of depositor(s)', ...(dep.signature ? { name: d.member.name, at: formatDisplayDateTime(dep.signature.signedAt), ...(dep.signature.fileId ? { fileId: dep.signature.fileId } : {}) } : {}) }, { label: 'Date', ...(dep.signature ? { value: formatDisplayDate(dep.signature.signedAt.slice(0, 10)) } : {}) }])}
<div class="office"><b>FOR OFFICE USE</b>${ln('Account No.', dep.status === 'ACTIVE' || issued ? dep.accountNo : '')}${ln('F.D.R. No.', dep.fdrNo)}${sigs([orPaper(signOff('Secretary (accepted)', dep.signOffs?.secretary), issued), orPaper(signOff('President (accepted)', dep.signOffs?.president), issued)])}</div>
<div class="box"><b>CASH SLIP</b><br>Received ${p?.mode === 'CASH' ? 'cash' : p?.mode === 'RENEWAL' ? `on renewal of ${esc(dep.renewedFrom?.fdrNo ?? p.receiptNo)}` : p ? `by ${esc(p.mode.toLowerCase())}` : ''} from Sri ${esc(d.member.name)} towards deposit${p ? `: ${esc(formatINR(p.amount))}, receipt ${esc(p.receiptNo)}` : ''}.
<table class="grid"><tbody>${slip}</tbody></table>Cashier: ${esc(p?.byName ?? '')}</div>`;
  return page(`F4 ${dep.accountNo}`, o.society, body, o.generatedOn, 'office');
}

/** F10: money paid out of an FD (maturity, early withdrawal, refund). */
export function fdVoucherHtml(d: DepositDetail, voucherNo: string, o: Opts): string {
  const dep = d.deposit;
  const v = dep.vouchers?.find((x) => x.no === voucherNo);
  if (!v) throw new Error('Voucher not found');
  const towards = v.kind === 'INTEREST' ? `Interest on FDR for the period ending ${formatDisplayDate(v.date)}` : v.kind === 'REFUND' ? 'Refund of FDR' : v.kind === 'PREMATURE' ? 'Interest on FDR and Refund of FDR (closed before maturity)' : 'Interest on FDR and Refund of FDR (on maturity)';
  const body = `<h2>FIXED DEPOSIT VOUCHER</h2>
<p style="display:flex;justify-content:space-between"><span>Vr. No. ${esc(v.no)}</span><span>Date: ${esc(formatDisplayDate(v.date))}</span></p>
<p>Received an amount of <b>${esc(formatINR(v.amount))}</b> (in words) Rupees ${esc(amountInWords(v.amount))} only towards ${esc(towards)}</p>
<ol><li>FDR ${esc(dep.fdrNo ?? dep.accountNo)}: principal ${esc(formatINR(v.amount - v.interest))}</li>${v.interest > 0 ? `<li>Interest ${esc(formatINR(v.interest))}</li>` : ''}</ol>
<p class="small">Name: ${esc(d.member.name)} (G.I. No. ${esc(d.member.generalNo)}) · Passed for Rs. ${esc(formatINR(v.amount))}, Rupees ${esc(amountInWords(v.amount))} only</p>
${sigs([{ label: 'Signature' }, { label: 'Secretary' }, { label: 'Treasurer (Cashier)', name: v.paidByName, ...(v.signatureFileId ? { fileId: v.signatureFileId } : {}) }])}
<p class="small">The member and the Secretary sign the printed copy (F10).</p>`;
  return page(`FD voucher ${v.no}`, o.society, body, o.generatedOn, 'office');
}

// ---- F5 / F6 recovery agreement -------------------------------------------------------------

export function agreementHtml(d: MemberDetail, version: 'A' | 'B', o: Opts): string {
  const m = d.member;
  const mandate = d.mandate;
  const dept = d.department?.name ?? '';
  const text =
    version === 'A'
      ? 'hereby authorise the society to recover from my monthly salary the instalments of loans and all other sums due by me to the society, <b>whether as borrower or as surety</b>. I further agree that any sum remaining unpaid at my retirement, or on my death earlier, shall be recovered from my <b>gratuity</b> and other dues payable to me.'
      : "hereby authorise you and the pay disbursing officers who succeed you to recover from my salary, on the demand of the society, the instalments of loans, the <b>thrift deposit</b> and all other sums due by me. A demand certified by an officer of the society shall be conclusive evidence of my liability, and the recovery shall not be suspended at my request. Sums unpaid at my retirement or death shall be recovered from my gratuity. On my transfer out of the Secretariat a copy of this agreement shall be sent to my new pay officer, who shall recover as per the society's demand list.";
  const agreed =
    version === 'B'
      ? `<div class="box"><p style="text-align:center;letter-spacing:6px"><b>AGREED</b></p>${sigs([
          { label: `Asst. / Deputy Secretary to Govt., ${dept}`, ...(mandate?.agreedByName ? { name: mandate.agreedByName, ...(mandate.agreedOn ? { at: formatDisplayDate(mandate.agreedOn) } : {}), ...(mandate.agreedSignatureFileId ? { fileId: mandate.agreedSignatureFileId } : {}) } : {}) },
          { label: mandate ? `Mandate ${mandate.status === 'AGREED' ? 'agreed' : mandate.status === 'PENDING_NEW_DDO' ? 'waiting for the new DDO' : 'superseded'}` : 'No mandate on file' },
        ])}</div>`
      : '';
  const body = `${title(version === 'A' ? 'F5' : 'F6', 'AGREEMENT WITH THE SOCIETY', version === 'A' ? `To the Secretary, ${o.society.shortName}` : `To the Asst. / Deputy Secretary to Government, ${dept}`)}
<p>I, <b>${esc(m.name)}</b>, ${esc(m.designation)}, ${esc(dept)}, General No. ${esc(m.generalNo)}, a member of ${esc(o.society.name)}, ${text}</p>
${sigs([{ label: 'Signature of the member', name: m.name, ...(mandate ? { at: `Signed ${formatDisplayDate(mandate.signedOn)}`, ...(mandate.signatureFileId ? { fileId: mandate.signatureFileId } : {}) } : {}) }, { label: 'Witness' }])}${agreed}`;
  return page(`${version === 'A' ? 'F5' : 'F6'} ${m.generalNo}`, o.society, body, o.generatedOn, 'office');
}

// ---- Letters and sheets ---------------------------------------------------------------------

/** REQ-066 defaulter notice. */
export function defaulterNoticeHtml(n: DefaulterNotice, o: Opts): string {
  const rows = n.rows.length
    ? `<table class="grid"><thead><tr><th>Month</th><th class="n">Demand</th><th class="n">Recovered</th><th class="n">Unpaid</th></tr></thead><tbody>${n.rows.map((r) => `<tr><td>${esc(formatCycle(r.cycle))}</td><td class="n">${esc(formatINR(r.demand))}</td><td class="n">${esc(formatINR(r.recovered))}</td><td class="n">${esc(formatINR(r.unpaid))}</td></tr>`).join('')}<tr><td colspan="3"><b>Total overdue</b></td><td class="n"><b>${esc(formatINR(n.totalUnpaid))}</b></td></tr></tbody></table>`
    : '<p class="box">No unpaid months on record. This member is not overdue.</p>';
  const body = `<p style="display:flex;justify-content:space-between"><span>Ref: ${esc(n.refNo)}</span><span>Date: ${esc(formatDisplayDate(n.asOf))}</span></p>
<p>To<br><b>${esc(n.member.name)}</b><br>General No. ${esc(n.member.generalNo)} · ${esc(n.member.designation)}<br>${esc(n.member.departmentName)}<br>${esc(addr(n.member.address))}</p>
<h2><u>NOTICE OF OVERDUE DUES</u></h2>
<p>${esc(n.text.greeting)}</p><p>${esc(n.text.body)}</p>${rows}
<p class="small">In words: ${esc(amountInWords(n.totalUnpaid))}. ${n.isDefaulter ? `Short in the last ${n.consecutiveShort} months in a row (defaulter after ${n.defaulterCycles}).` : ''}</p>
<div class="box"><b>How to pay</b><br>Bank: ${esc(n.payTo.accountName)}, A/c ${esc(n.payTo.accountNo)}, IFSC ${esc(n.payTo.ifsc)} · UPI ${esc(n.payTo.upi)}<br>Cash: ${esc(n.payTo.counter)}</div>
<p>${esc(n.text.closing)}</p>${sigs([{ label: 'Secretary', at: `for ${o.society.shortName}` }])}
<p class="small">Copy to: DDO, ${esc(n.member.departmentName)}.</p>`;
  return page(`Defaulter notice ${n.member.generalNo}`, o.society, body, o.generatedOn, 'office');
}

const EXIT_LABEL: Record<string, string> = { RETIRED: 'Retired', RESIGNED: 'Resigned', DECEASED: 'Deceased' };

/** F-08 final settlement letter to the pay disbursing officer. */
export function settlementHtml(v: SettlementView, o: Opts): string {
  const s = v.settlement;
  const st = v.statement;
  if (!s || !st) throw new Error('No settlement yet');
  const deceased = s.exit.status === 'DECEASED';
  const rows = (heading: string, lines: Array<{ label: string; amount: number }>, total: number) =>
    `<table class="grid"><thead><tr><th>${esc(heading)}</th><th class="n">Amount</th></tr></thead><tbody>${lines.length ? lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${esc(formatINR(l.amount))}</td></tr>`).join('') : '<tr><td colspan="2">Nil</td></tr>'}<tr><td><b>Total</b></td><td class="n"><b>${esc(formatINR(total))}</b></td></tr></tbody></table>`;
  const outcome =
    st.net < 0
      ? `As agreed by the member in the salary recovery agreement, you are requested to recover <b>${esc(formatINR(-st.net))}</b> (${esc(amountInWords(-st.net))}) from the member's gratuity and other terminal benefits and remit it to the society.`
      : st.net > 0
        ? `Nothing is due to the society. <b>${esc(formatINR(st.net))}</b> (${esc(amountInWords(st.net))}) will be paid to ${deceased ? `the nominee, ${esc(v.member.nominee?.name ?? '')} (${esc(v.member.nominee?.relation ?? '')})` : 'the member'}.`
        : 'The account is settled in full; nothing is due either way.';
  const body = `<p style="display:flex;justify-content:space-between"><span>Ref: ${esc(o.society.shortName)}/FS/${esc(v.member.generalNo)}</span><span>Date: ${esc(formatDisplayDate((s.posted?.at ?? s.exit.at).slice(0, 10)))}</span></p>
<p>To<br>${esc(v.department ? `${v.department.ddoDesignation}, ${v.department.name}` : 'The Pay Disbursing Officer')}<br>Dr. B.R Ambedkar Telangana Secretariat, Hyderabad</p>
<h2><u>FINAL SETTLEMENT · ${esc((EXIT_LABEL[s.exit.status] ?? s.exit.status).toUpperCase())} MEMBER</u></h2>
<p>Sri / Smt <b>${esc(v.member.name)}</b>, General No. ${esc(v.member.generalNo)}, ${esc(v.member.designation)}, ${esc(v.member.departmentName)}, ${deceased ? 'passed away' : s.exit.status === 'RETIRED' ? 'retired' : 'resigned'} on ${esc(formatDisplayDate(s.exit.date))}. The member's account with the society as on that date is:</p>
${rows('Due to the society', st.owes, st.totalOwed)}${rows('Held by the society for the member', st.holds, st.totalHeld)}
<p>${outcome}</p>
${s.posted ? `<p class="small">Posted ${esc(formatDisplayDateTime(s.posted.at))} by ${esc(s.posted.byName)}: received ${esc(formatINR(s.posted.received))}, paid ${esc(formatINR(s.posted.paid))} to ${esc(s.posted.payeeName)}, ref ${esc(s.posted.reference)}.</p>` : ''}
${sigs([{ label: 'Accountant' }, { label: 'Secretary' }])}`;
  return page(`Settlement ${v.member.generalNo}`, o.society, body, o.generatedOn, 'office');
}

/** G2 office payment / receipt voucher. */
export function officeVoucherHtml(v: OfficeVoucher, o: Opts): string {
  const pay = v.kind === 'PAYMENT';
  const body = `<h2>${pay ? 'PAYMENT VOUCHER' : 'RECEIPT VOUCHER'}</h2>
<p style="display:flex;justify-content:space-between"><span>Vr. No. ${esc(v.voucherNo)}</span><span>Date: ${esc(formatDisplayDate(v.date))}</span></p>
${v.reversed ? '<div class="void">CANCELLED (entry reversed)</div>' : ''}
<p>${pay ? 'Paid to' : 'Received from'} <b>${esc(v.party)}</b> a sum of <b>${esc(formatINR(v.amount))}</b> (Rupees ${esc(amountInWords(v.amount))} only) towards ${esc(v.narration)}.</p>
<table><tr><th>Head of account</th><td>${esc(`${v.headCode} ${v.headName}`)}</td></tr><tr><th>${pay ? 'Paid by' : 'Received by'}</th><td>${esc(v.mode === 'CASH' ? 'Cash' : `Bank, ref. ${v.reference ?? ''}`)}</td></tr><tr><th>Journal entry</th><td>${esc(v.entryNo)}</td></tr></table>
${sigs([{ label: 'Prepared by (Accountant)', name: v.createdByName }, { label: 'Secretary' }, { label: pay ? "Receiver's signature" : 'Cashier' }])}`;
  return page(`Voucher ${v.voucherNo}`, o.society, body, o.generatedOn, 'office');
}

/** ST-42 department demand for one month, for the DDO. */
export function demandSheetHtml(d: DemandSheetDetail, heads: Array<{ head: DemandHead; label: string }>, o: Opts): string {
  const sh = d.sheet;
  const posted = sh.status === 'RECOVERY_POSTED';
  const cols = heads.filter((h) => d.totals.heads[h.head]);
  // D-147: an all-departments sheet prints department by department, each with its DDO and a subtotal.
  const span = cols.length + 3 + (posted ? 2 : 0);
  const part = (id?: string) => d.byDepartment?.find((p) => p.departmentId === id);
  const row = (l: DemandSheetDetail['lines'][number]) =>
    `<tr><td>${esc(l.generalNo)}</td><td>${esc(l.name)}<br><span class="small">${esc(l.designation)}</span></td>${cols.map((h) => `<td class="n">${l.heads[h.head] ? esc(formatINR(l.heads[h.head]!)) : '—'}</td>`).join('')}<td class="n"><b>${esc(formatINR(l.totalDemand))}</b></td>${posted ? `<td class="n">${esc(formatINR(l.recovered ?? 0))}</td><td class="n">${l.short ? esc(formatINR(l.short)) : '—'}</td>` : ''}</tr>`;
  const lines = d.lines
    .map((l, i) => {
      const p = part(l.departmentId);
      const head = p && d.lines[i - 1]?.departmentId !== l.departmentId ? `<tr><td colspan="${span}"><b>${esc(p.departmentName)}</b> <span class="small">· ${p.members} members · DDO ${esc(p.ddoName)}, ${esc(p.ddoDesignation)}</span></td></tr>` : '';
      const sub = p && d.lines[i + 1]?.departmentId !== l.departmentId ? `<tr><td colspan="2"><b>Subtotal · ${esc(p.departmentName)}</b></td>${cols.map((h) => `<td class="n"><b>${esc(formatINR(p.heads[h.head] ?? 0))}</b></td>`).join('')}<td class="n"><b>${esc(formatINR(p.demand))}</b></td>${posted ? `<td class="n"><b>${esc(formatINR(p.recovered))}</b></td><td class="n"><b>${esc(formatINR(p.short))}</b></td>` : ''}</tr>` : '';
      return `${head}${row(l)}${sub}`;
    })
    .join('');
  const totals = `<tr><td colspan="2"><b>Total</b></td>${cols.map((h) => `<td class="n"><b>${esc(formatINR(d.totals.heads[h.head] ?? 0))}</b></td>`).join('')}<td class="n"><b>${esc(formatINR(d.totals.demand))}</b></td>${posted ? `<td class="n"><b>${esc(formatINR(d.totals.recovered))}</b></td><td class="n"><b>${esc(formatINR(d.totals.short))}</b></td>` : ''}</tr>`;
  const body = `<h2>DEMAND · ${esc((d.department?.name ?? '').toUpperCase())} · ${esc(formatCycle(sh.cycle).toUpperCase())}${sh.supplementNo ? ` · SUPPLEMENT ${sh.supplementNo}` : ''}</h2>
<table class="grid" style="font-size:10px"><thead><tr><th>No.</th><th>Member</th>${cols.map((h) => `<th class="n">${esc(h.label)}</th>`).join('')}<th class="n">Demand</th>${posted ? '<th class="n">Recovered</th><th class="n">Short</th>' : ''}</tr></thead><tbody>${lines}${totals}</tbody></table>
${sigs([{ label: 'Accountant' }, { label: `DDO, ${d.department?.name ?? ''}` }])}`;
  return page(`Demand ${sh.cycle} ${d.department?.code ?? ''}`, o.society, body, o.generatedOn, 'office');
}

/** ST-51 any report, grouped with subtotals, on the letterhead. */
export function reportHtml(r: ReportResult, o: Opts): string {
  const grouped = r.groups.some((g) => g.label);
  const cell = (c: ReportColumn, v: ReportCell | undefined) => {
    if (c.type === 'money') return formatINR(Number(v ?? 0));
    if (c.type === 'percent') return `${(Number(v ?? 0) * 100).toFixed(2)}%`;
    if (v && c.type === 'date') return formatDisplayDate(String(v));
    if (v && c.type === 'cycle') return formatCycle(String(v));
    return String(v ?? '');
  };
  const num = (c: ReportColumn) => (c.type === 'money' || c.type === 'percent' || c.type === 'number' ? ' class="n"' : '');
  const tr = (cells: string[], bold = false) => `<tr>${cells.map((x, i) => `<td${i >= cells.length - r.columns.length ? num(r.columns[i - (cells.length - r.columns.length)]!) : ''}>${bold ? `<b>${esc(x)}</b>` : esc(x)}</td>`).join('')}</tr>`;
  const body = r.groups
    .map((g) => `${g.rows.map((row) => tr([...(grouped ? [g.label] : []), ...r.columns.map((c) => cell(c, row[c.key]))])).join('')}${grouped ? tr([`${g.label} subtotal`, ...r.columns.map((c) => (c.total ? cell(c, g.subtotal[c.key] ?? 0) : ''))], true) : ''}`)
    .join('');
  const total = tr([...(grouped ? ['Total'] : []), ...r.columns.map((c, i) => (c.total ? cell(c, r.totals[c.key] ?? 0) : !grouped && i === 0 ? 'Total' : ''))], true);
  const html = `<h2>${esc(r.def.title.toUpperCase())}</h2><p class="sub">${esc(r.filterLabels.join(' · '))} · as on ${esc(formatDisplayDate(r.asOf))}</p>
<table class="grid" style="font-size:10px"><thead><tr>${grouped ? '<th>Group</th>' : ''}${r.columns.map((c) => `<th${num(c)}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body}${total}</tbody></table>`;
  return page(r.def.title, o.society, html, o.generatedOn, 'office');
}
