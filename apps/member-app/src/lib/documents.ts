// Member copies of the member's own documents (receipt, FDR, sanction letter, repayment schedule) as
// printable HTML. expo-print turns them into a PDF or sends them to a printer (see DocumentActions).
// Pure: no React Native imports, so the wording is unit-tested. The office print stays the official copy.
import { amountInWords, formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { DepositDetail, JoiningReference, LoanDetail, ReceiptDetail } from '@tgs/types';

export type Society = JoiningReference['society'];

/** Used until the society's own details load (the letterhead on every form, docs/16). */
export const DEFAULT_SOCIETY: Society = {
  name: 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.',
  shortName: 'TGSECCSL',
  registrationNo: 'P-929',
  address: '2nd Floor, West Ancillary Building, Dr. B.R Ambedkar Telangana Secretariat, Hyderabad-500004',
};

const esc = (v: string | number | undefined | null) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const row = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;

const CSS = `
  @page { size: A4; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #1b3a6b; padding-bottom: 8px; margin-bottom: 14px; }
  header h1 { font-size: 16px; margin: 0; color: #1b3a6b; }
  header p { margin: 2px 0 0; font-size: 11px; }
  h2 { text-align: center; font-size: 14px; letter-spacing: 1px; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
  th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { width: 40%; font-weight: normal; color: #444; }
  table.grid th { width: auto; background: #f1f4f9; color: #111; font-weight: bold; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .big { font-size: 18px; font-weight: bold; }
  .void { border: 2px solid #b91c1c; color: #b91c1c; padding: 6px 10px; font-weight: bold; margin-bottom: 10px; }
  .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
  .sign div { flex: 1; }
  footer { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 10px; color: #555; }
`;

function page(title: string, society: Society, body: string, generatedOn: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<header><h1>${esc(society.name)}</h1><p>Regd. No. ${esc(society.registrationNo)}${society.address ? ` · ${esc(society.address)}` : ''}</p></header>
${body}
<footer>Member copy, generated from the ${esc(society.shortName)} app on ${esc(formatDisplayDate(generatedOn))}. The copy signed at the society office is the official document.</footer>
</body></html>`;
}

/** The phone's own date as YYYY-MM-DD, for the "generated on" line. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A file name the member recognises in their Downloads folder. */
export function documentFileName(kind: string, ref: string): string {
  return `${kind}-${ref}`.replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.pdf';
}

/** MB-10 receipt. `paidBy` is the screen's label for the payment mode. */
export function receiptHtml(d: ReceiptDetail, opts: { society: Society; paidBy: string; generatedOn: string }): string {
  const r = d.receipt;
  const lines = d.lines.length
    ? `<table class="grid"><thead><tr><th>Towards</th><th class="n">Amount</th></tr></thead><tbody>${d.lines
        .map((l) => `<tr><td>${esc(`${l.cycle ? `${formatCycle(l.cycle)} · ` : ''}${l.label}${l.loanNo ? ` · ${l.loanNo}` : ''}`)}</td><td class="n">${esc(formatINR(l.amount))}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const body = `<h2>RECEIPT</h2>
${r.cancelled ? `<div class="void">CANCELLED on ${esc(formatDisplayDate(r.cancelled.at.slice(0, 10)))}: ${esc(r.cancelled.reason)}</div>` : ''}
<table>${row('Receipt No.', r.receiptNo)}${row('Date', formatDisplayDate(r.date))}${row('Received from', `${d.member.name}, General No. ${d.member.generalNo}`)}${row('Department', `${d.member.designation}, ${d.member.departmentName}`)}${row('Paid by', `${opts.paidBy}${r.reference ? ` · ${r.reference}` : ''}`)}${r.byName ? row('Received by', r.byName) : ''}</table>
<p class="big">${esc(formatINR(r.amount))}</p>
<p>${esc(d.amountInWords)}</p>
${lines}`;
  return page(`Receipt ${r.receiptNo}`, opts.society, body, opts.generatedOn);
}

/** MB-09 Fixed Deposit Receipt (form F4 particulars). `payout` is the screen's label for the payout option. */
export function fdrHtml(d: DepositDetail, opts: { society: Society; payout?: string; generatedOn: string }): string {
  const dep = d.deposit;
  const principal = dep.principal ?? 0;
  const holders = dep.holders?.length ? dep.holders.map((h) => h.name).join(', ') : '';
  const sec = dep.signOffs?.secretary;
  const pres = dep.signOffs?.president;
  const body = `<h2>FIXED DEPOSIT RECEIPT</h2>
<table>${row('FDR No.', dep.fdrNo ?? '')}${row('Account No.', dep.accountNo)}${row('Depositor', `${d.member.name}, General No. ${d.member.generalNo}`)}${holders ? row('Joint holders', holders) : ''}${dep.minor ? row('Minor', `${dep.minor.name} (guardian ${dep.minor.guardianName})`) : ''}${row('Amount', `${formatINR(principal)} (${amountInWords(principal)})`)}${row('Deposited on', formatDisplayDate(dep.openedOn))}${row('Period', `${dep.tenureMonths ?? ''} months at ${dep.ratePercent}% a year`)}${opts.payout ? row('Interest paid', opts.payout) : ''}${dep.maturityDate ? row('Matures on', formatDisplayDate(dep.maturityDate)) : ''}${dep.maturityValue ? row('Maturity value', formatINR(dep.maturityValue)) : ''}${dep.nominee ? row('Nominee', `${dep.nominee.name} (${dep.nominee.relation})`) : ''}</table>
${d.rules.length ? `<ol>${d.rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
<div class="sign"><div>${sec ? `<b>${esc(sec.byName)}</b><br>Secretary · accepted ${esc(formatDisplayDateTime(sec.at))}` : 'Secretary'}</div><div>${pres ? `<b>${esc(pres.byName)}</b><br>President · accepted ${esc(formatDisplayDateTime(pres.at))}` : 'President'}</div></div>`;
  return page(`FDR ${dep.fdrNo ?? dep.accountNo}`, opts.society, body, opts.generatedOn);
}

/** ST-52 sanction letter, the same wording as the console's letter. Only once the President has signed. */
export function sanctionLetterHtml(d: LoanDetail, opts: { society: Society; generatedOn: string }): string {
  const l = d.loan;
  const s = l.sanctionSheet;
  if (!s || !l.sanctionLetterNo) throw new Error('No sanction letter yet');
  const sign = (label: string, so?: { byName: string; at: string }) => `<div>${so ? `<b>${esc(so.byName)}</b><br>` : ''}${label}<br><small>${so ? `Signed digitally · ${esc(formatDisplayDateTime(so.at))}` : ''}</small></div>`;
  const body = `<p style="display:flex;justify-content:space-between"><span>Ref: ${esc(l.sanctionLetterNo)}</span><span>Date: ${esc(formatDisplayDate((l.signOffs?.president?.at ?? '').slice(0, 10) || l.appliedOn))}</span></p>
<p>To<br>${esc(d.member.name)}, General No. ${esc(d.member.generalNo)}<br>${esc(d.member.designation)}, ${esc(d.member.departmentName)}</p>
<p><b><u>Sub: Sanction of ${esc(d.product.name)}: application ${esc(l.applicationNo)}</u></b></p>
<p>With reference to your application dated ${esc(formatDisplayDate(l.appliedOn))}, the society has sanctioned a ${esc(d.product.name)} of <b>${esc(formatINR(s.amount))}</b> (${esc(amountInWords(s.amount))}) at ${esc(s.ratePercent)}% a year, repayable in <b>${esc(s.instalments)} monthly instalments</b> from ${esc(formatCycle(s.firstDueCycle))}, recovered from your salary by your Drawing &amp; Disbursing Officer.${s.earlyInterest ? ` The first deduction also includes ${esc(formatINR(s.earlyInterest))} interest for the days between payment and 1 ${esc(formatCycle(s.firstDueCycle))}.` : ''}</p>
<table>${row('Sanctioned amount', formatINR(s.amount))}${row('Monthly instalment (first → last)', `${formatINR(s.emi)}${s.lastEmi !== s.emi ? ` → ${formatINR(s.lastEmi)}` : ''}`)}${s.topup ? row(`Settlement of loan ${s.topup.loanNo} (incl. interest to date)`, `− ${formatINR(s.topup.settlement)}`) : ''}${row('Share deposit deduction', `− ${formatINR(s.shareDeduction)}`)}${row('Net amount payable to you', formatINR(s.netDisbursable))}</table>
<p>The loan is subject to the bye-laws of the society and the salary recovery agreement signed by you${d.sureties.length ? ` and your sureties (${esc(d.sureties.map((x) => x.name).join(', '))})` : ''}.</p>
<div class="sign">${sign('Secretary', l.signOffs?.secretary)}${sign('President', l.signOffs?.president)}</div>`;
  return page(`Sanction letter ${l.sanctionLetterNo}`, opts.society, body, opts.generatedOn);
}

/** MB-04 repayment schedule with each month's status. */
export function scheduleHtml(d: LoanDetail, opts: { society: Society; generatedOn: string }): string {
  const l = d.loan;
  const total = (k: 'interest' | 'principal' | 'emi') => l.schedule.reduce((t, r) => t + r[k], 0);
  const first = l.schedule[0];
  const body = `<h2>REPAYMENT SCHEDULE</h2>
<table>${row('Member', `${d.member.name}, General No. ${d.member.generalNo}`)}${row('Loan', `${d.product.name} · ${l.loanNo ?? l.applicationNo}`)}${row('Amount', formatINR(l.sanctionedAmount ?? l.appliedAmount))}${row('Rate', `${l.ratePercent}% a year`)}${l.disbursedOn ? row('Paid out on', formatDisplayDate(l.disbursedOn)) : ''}</table>
<table class="grid"><thead><tr><th>No.</th><th>Month</th><th class="n">Opening</th><th class="n">Interest</th><th class="n">Principal</th><th class="n">Instalment</th><th class="n">Closing</th><th>Status</th></tr></thead><tbody>${l.schedule
    .map((r) => `<tr><td>${r.installmentNo}</td><td>${esc(formatCycle(r.dueCycle))}</td><td class="n">${esc(formatINR(r.opening))}</td><td class="n">${esc(formatINR(r.interest))}</td><td class="n">${esc(formatINR(r.principal))}</td><td class="n">${esc(formatINR(r.emi))}</td><td class="n">${esc(formatINR(r.closing))}</td><td>${esc(r.paidStatus.toLowerCase().replace(/_/g, ' '))}</td></tr>`)
    .join('')}<tr><td colspan="3"><b>Total</b></td><td class="n"><b>${esc(formatINR(total('interest')))}</b></td><td class="n"><b>${esc(formatINR(total('principal')))}</b></td><td class="n"><b>${esc(formatINR(total('emi')))}</b></td><td colspan="2"></td></tr></tbody></table>
${first?.earlyInterest ? `<p>Instalment 1 includes ${esc(formatINR(first.earlyInterest))} interest for the days between the loan being paid and 1 ${esc(formatCycle(first.dueCycle))}.</p>` : ''}`;
  return page(`Repayment schedule ${l.loanNo ?? l.applicationNo}`, opts.society, body, opts.generatedOn);
}
