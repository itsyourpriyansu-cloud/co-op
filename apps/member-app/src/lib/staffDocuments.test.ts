import type { DepositDetail, LoanDetail, OfficeVoucher, ReportResult } from '@tgs/types';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOCIETY, sigImg, withSignatures } from './documents';
import { fdFormHtml, loanFormHtml, officeVoucherHtml, reportHtml } from './staffDocuments';

const o = { society: DEFAULT_SOCIETY, generatedOn: '2026-11-19' };
const member = { name: 'Ravi <K>', generalNo: '1103', designation: 'JA', departmentName: 'Finance', dob: '1985-01-01', dor: '2045-01-31', leftover: { label: '18 years' }, mobileMasked: 'XXXXXX1234', fatherName: 'K' };

describe('staff office copies (D-133)', () => {
  it('fills signature placeholders, and drops one that cannot be loaded', async () => {
    const html = `<p>${sigImg('fil-a')}${sigImg('fil-b')}${sigImg(undefined)}</p>`;
    const out = await withSignatures(html, async (id) => (id === 'fil-a' ? 'data:image/png;base64,AAA' : Promise.reject(new Error('404'))));
    expect(out).toBe('<p><img class="sig" src="data:image/png;base64,AAA" alt=""></p>');
  });

  it('F3: office copy with the bank account, escaped names, signature placeholder and paper fallback', () => {
    const d = {
      member,
      product: { name: 'Salary Loan' },
      sureties: [],
      preview: { netSalary: 0 },
      loan: {
        product: 'SALARY', status: 'ACTIVE', applicationNo: 'APP-9', loanNo: 'SL-1', appliedAmount: 1_000_000, purpose: 'Medical', sureties: [],
        signature: { signedAt: '2026-11-01T10:00:00+05:30', textVersion: 'v1', fileId: 'fil-me' },
        form: { salary: { substantivePay: 5_000_000, compulsoryDeductions: [], netPayEarnedToDate: 2_000_000 }, bankAccount: { holderName: 'Ravi', bankName: 'SBI', accountNo: '12345678901', ifsc: 'SBIN0001234' } },
      },
    } as unknown as LoanDetail;
    const html = loanFormHtml(d, undefined, o);
    expect(html).toContain('FORM F3');
    expect(html).toContain('Office copy');
    expect(html).toContain('A/c 12345678901');
    expect(html).toContain('RAVI &lt;K&gt;');
    expect(html).toContain('data-sig="fil-me"');
    // An active loan with no office sign-offs was signed on paper.
    expect(html.match(/On paper, before the app/g)).toHaveLength(3);
  });

  it('F4: an issued FDR without digital sign-offs says it was accepted on paper; the cash slip lists notes', () => {
    const d = {
      member,
      deposit: { accountNo: 'FD-00001', fdrNo: 'FDR-2025-00001', status: 'ACTIVE', principal: 10_000_000, ratePercent: 7.5, tenureMonths: 12, payment: { mode: 'CASH', amount: 10_000_000, receiptNo: 'R-1', denominations: { 500: 200 }, byName: 'Cashier C' } },
    } as unknown as DepositDetail;
    const html = fdFormHtml(d, o);
    expect(html.match(/On paper, before the app/g)).toHaveLength(2);
    expect(html).toContain('Cashier: Cashier C');
    expect(html).toContain('₹1,00,000');
  });

  it('office voucher and report: cancelled mark, money formatted, totals', () => {
    const v = { voucherNo: 'PV-1', kind: 'PAYMENT', date: '2026-11-10', headCode: '5100', headName: 'Stationery', amount: 50_000, mode: 'CASH', party: 'Shop', narration: 'paper', entryNo: 'JE-1', reversed: true, createdByName: 'Acct' } as unknown as OfficeVoucher;
    expect(officeVoucherHtml(v, o)).toContain('CANCELLED (entry reversed)');
    const r = {
      def: { title: 'Loans outstanding' }, asOf: '2026-11-19', filterLabels: ['All'],
      columns: [{ key: 'name', label: 'Member', type: 'text' }, { key: 'due', label: 'Due', type: 'money', total: true }, { key: 'on', label: 'Since', type: 'date' }],
      groups: [{ label: '', rows: [{ name: 'A', due: 150_000, on: '2026-01-05' }], subtotal: {} }],
      totals: { due: 150_000 }, rowCount: 1,
    } as unknown as ReportResult;
    const html = reportHtml(r, o);
    expect(html).toContain('₹1,500');
    expect(html).toContain('05 Jan 2026');
    expect(html).toContain('<b>Total</b>');
  });
});
