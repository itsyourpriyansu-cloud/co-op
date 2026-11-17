import { formatINR, generateSchedule } from '@tgs/domain';
import type { DepositDetail, LoanDetail, ReceiptDetail } from '@tgs/types';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOCIETY, documentFileName, fdrHtml, localDate, receiptHtml, sanctionLetterHtml, scheduleHtml } from './documents';

const society = DEFAULT_SOCIETY;
const generatedOn = '2026-11-17';
const member = { id: 'm1', name: 'Ravi <Kumar> & Co', generalNo: '1103', departmentName: 'Finance', designation: 'Section Officer' };

const receipt = {
  receipt: { id: 'r1', receiptNo: 'RCP-202611-000012', memberId: 'm1', date: '2026-11-10', source: 'CASH', amount: 568_400, reference: 'UTR9', byName: 'Cashier One' },
  member,
  lines: [{ head: 'INTEREST', label: 'Ordinary loan interest', cycle: '2026-11', loanNo: 'LN-2026-00001', amount: 91_700 }],
  amountInWords: 'Rupees Five Thousand Six Hundred Eighty Four only',
} as unknown as ReceiptDetail;

const loan = (over: Partial<LoanDetail['loan']> = {}) =>
  ({
    member,
    product: { name: 'Ordinary Loan' },
    sureties: [{ name: 'Surety One' }, { name: 'Surety Two' }],
    loan: {
      applicationNo: 'APP-1',
      loanNo: 'LN-2026-00001',
      appliedOn: '2026-11-01',
      appliedAmount: 10_000_000,
      sanctionedAmount: 10_000_000,
      ratePercent: 11,
      disbursedOn: '2026-11-28',
      sanctionLetterNo: 'SL-2026-0001',
      sanctionSheet: { amount: 10_000_000, instalments: 24, ratePercent: 11, emi: 508_400, lastEmi: 419_700, totalInterest: 1_154_700, firstDueCycle: '2026-12', earlyInterest: 9_000, shareDeduction: 1_000_000, netDisbursable: 9_000_000, balances: { ordinary: 0, salary: 0 } },
      signOffs: { secretary: { byName: 'Sec Name', at: '2026-11-20T10:00:00+05:30' }, president: { byName: 'Pres Name', at: '2026-11-21T10:00:00+05:30' } },
      schedule: generateSchedule(10_000_000, 11, 24, 'EQUAL_PRINCIPAL', '2026-12', 9_000),
      ...over,
    },
  }) as unknown as LoanDetail;

describe('member documents', () => {
  it('receipt: letterhead, amount, lines, member copy note; names are escaped', () => {
    const html = receiptHtml(receipt, { society, paidBy: 'Cash', generatedOn });
    expect(html).toContain('Regd. No. P-929');
    expect(html).toContain('RCP-202611-000012');
    expect(html).toContain('₹5,684');
    expect(html).toContain('Nov 2026 · Ordinary loan interest · LN-2026-00001');
    expect(html).toContain('Member copy');
    expect(html).toContain('Ravi &lt;Kumar&gt; &amp; Co');
    expect(html).not.toContain('<Kumar>');
    expect(html).not.toContain('CANCELLED');
  });

  it('a cancelled receipt says so', () => {
    const cancelled = { ...receipt, receipt: { ...receipt.receipt, cancelled: { at: '2026-11-10T12:00:00+05:30', reason: 'Wrong member', byName: 'Acct' } } } as ReceiptDetail;
    expect(receiptHtml(cancelled, { society, paidBy: 'Cash', generatedOn })).toContain('CANCELLED on 10 Nov 2026: Wrong member');
  });

  it('sanction letter: the console wording, first deduction month and early interest, both signatures', () => {
    const html = sanctionLetterHtml(loan(), { society, generatedOn });
    expect(html).toContain('Ref: SL-2026-0001');
    expect(html).toContain('repayable in <b>24 monthly instalments</b> from Dec 2026');
    expect(html).toContain('₹90 interest for the days between payment and 1 Dec 2026');
    expect(html).toContain('Net amount payable to you');
    expect(html).toContain('your sureties (Surety One, Surety Two)');
    expect(html).toContain('Sec Name');
    expect(html).toContain('Pres Name');
    expect(() => sanctionLetterHtml(loan({ sanctionLetterNo: undefined }), { society, generatedOn })).toThrow();
  });

  it('repayment schedule: every row, totals, and the early-interest note', () => {
    const d = loan();
    const html = scheduleHtml(d, { society, generatedOn });
    expect((html.match(/<tr><td>\d+<\/td>/g) ?? []).length).toBe(24);
    const total = d.loan.schedule.reduce((t, r) => t + r.emi, 0);
    expect(html).toContain(`<b>${formatINR(total)}</b>`);
    expect(html).toContain('Instalment 1 includes ₹90 interest');
  });

  it('FDR: number, amount in words, maturity and acceptances', () => {
    const d = {
      member,
      rules: ['Interest ceases from the date of maturity.'],
      deposit: { accountNo: 'FD-00001', fdrNo: 'FDR-2026-00001', scheme: 'FD', status: 'ACTIVE', principal: 10_000_000, openedOn: '2026-12-10', tenureMonths: 12, ratePercent: 7.5, maturityDate: '2027-12-10', maturityValue: 10_771_400, signOffs: { secretary: { byName: 'Sec Name', at: '2026-12-11T10:00:00+05:30' } } },
    } as unknown as DepositDetail;
    const html = fdrHtml(d, { society, payout: 'At maturity', generatedOn });
    expect(html).toContain('FDR-2026-00001');
    expect(html).toContain('₹1,07,714');
    expect(html).toContain('Rupees One Lakh');
    expect(html).toContain('Interest ceases from the date of maturity.');
    expect(html).toContain('Sec Name');
  });

  it('file names are safe, and the date is the phone\'s own', () => {
    expect(documentFileName('Receipt', 'RCP-202611-000012')).toBe('Receipt-RCP-202611-000012.pdf');
    expect(documentFileName('FDR', 'FDR/2026 00001')).toBe('FDR-FDR-2026-00001.pdf');
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
