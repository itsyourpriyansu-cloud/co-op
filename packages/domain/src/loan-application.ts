// Loan application (M4): what makes an F2 / F3 application complete, the Salary-loan limit
// (BR-023, Q-502 placeholder), and the stage tracker both apps draw (MB-04 labels, D-030).
import type { Cycle, ISODate, LoanApplicationForm, LoanProduct, LoanStatus, LoanStatusGroup, Paise, WorkflowEvent } from '@tgs/types';
import { addMonths, toCycle } from './dates';
import { calculateSalaryLoanNetPay } from './loans';
import { formatINR } from './money';
import { fail, pass, type RuleCheck } from './rules';

/** First EMI falls in the month after the application month (docs/09 BR-006 schedule start). */
export function firstDueCycle(today: ISODate): Cycle {
  return toCycle(addMonths(`${toCycle(today)}-01`, 1));
}

/** Cycle of the last instalment when the first is `first`. */
export function lastInstalmentCycle(first: Cycle, instalments: number): Cycle {
  return toCycle(addMonths(`${first}-01`, Math.max(1, instalments) - 1));
}

/**
 * BR-023 (form F3): net substantive pay = substantive pay − compulsory deductions − Ordinary-loan dues.
 * [P, D-058] the amount may not exceed the net pay earned up to date, and the net pay must be positive.
 */
export function checkSalaryLoan(amount: Paise, salary: NonNullable<LoanApplicationForm['salary']>, ordinaryLoanDues: Paise): { netSubstantivePay: Paise; checks: RuleCheck[] } {
  const netSubstantivePay = calculateSalaryLoanNetPay(salary.substantivePay, salary.compulsoryDeductions.map((d) => d.amount), ordinaryLoanDues);
  return {
    netSubstantivePay,
    checks: [
      netSubstantivePay > 0 ? pass('BR-023', `Net substantive pay this month is ${formatINR(netSubstantivePay)}.`) : fail('BR-023', 'Deductions take up the whole substantive pay, so no salary loan is possible this month.'),
      amount <= salary.netPayEarnedToDate ? pass('BR-023', `Within the net pay earned so far (${formatINR(salary.netPayEarnedToDate)}).`) : fail('BR-023', `A salary loan can be at most the net pay earned so far (${formatINR(salary.netPayEarnedToDate)}).`),
    ],
  };
}

export interface LoanRequestShape {
  product: string;
  amount: Paise;
  instalments: number;
  purpose: string;
  sureties: string[];
  pledgedDepositId?: string;
  form: LoanApplicationForm;
}

/**
 * Completeness of an application before it can be signed and submitted (field → message).
 * Eligibility (amount, tenure, BR-018 …) is `assessLoanApplication`; this is about the form.
 */
export function validateLoanRequest(input: LoanRequestShape, product: Pick<LoanProduct, 'code' | 'suretiesRequired'>, borrowerId: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(input.amount > 0)) e.amount = 'Enter the amount you need';
  if (!Number.isInteger(input.instalments) || input.instalments < 1) e.instalments = 'Choose the number of monthly instalments';
  if (input.purpose.trim().length < 3) e.purpose = 'Tell us what the loan is for';
  const f = input.form;
  if (product.code === 'SALARY') {
    if (!f.salary || !(f.salary.substantivePay > 0)) e['salary.substantivePay'] = 'Enter your substantive pay';
    if (f.salary && !(f.salary.netPayEarnedToDate > 0)) e['salary.netPayEarnedToDate'] = 'Enter the net pay earned so far this month';
    if (f.salary?.compulsoryDeductions.some((d) => !d.label.trim() || !(d.amount >= 0))) e['salary.compulsoryDeductions'] = 'Give each deduction a name and an amount';
  } else {
    if (!f.pay || !(f.pay.grossSalary > 0)) e['pay.grossSalary'] = 'Enter your gross salary';
    if (f.pay && (f.pay.govtLoanDeductions < 0 || f.pay.otherLoanDeductions < 0)) e['pay.deductions'] = 'Deductions cannot be negative';
  }
  if (product.code === 'EDUCATION') {
    const ed = f.education;
    if (!ed?.studentName.trim()) e['education.studentName'] = "Enter the student's name";
    if (!ed?.institution.trim()) e['education.institution'] = 'Enter the institution';
    if (!ed?.course.trim()) e['education.course'] = 'Enter the course';
  }
  if (product.code === 'DEPOSIT' && !input.pledgedDepositId) e.pledgedDepositId = 'Choose the fixed deposit to pledge';
  if (product.suretiesRequired > 0) {
    const unique = new Set(input.sureties);
    if (input.sureties.includes(borrowerId)) e.sureties = 'You cannot be your own surety';
    else if (unique.size !== input.sureties.length) e.sureties = 'Choose different members as sureties';
    else if (unique.size < product.suretiesRequired) e.sureties = `Add ${product.suretiesRequired} sureties (${unique.size} chosen)`;
    else if (unique.size > product.suretiesRequired) e.sureties = `This loan needs exactly ${product.suretiesRequired} sureties`;
  }
  return e;
}

// ---- status groups and the stage tracker --------------------------------------------------------

/** ST-20 status filter / MB-03 segments. */
export function loanStatusGroup(status: LoanStatus): LoanStatusGroup {
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'CLOSED' || status === 'CLOSED_BY_TOPUP') return 'CLOSED';
  if (status === 'REJECTED' || status === 'WITHDRAWN') return 'REJECTED';
  return 'IN_PROCESS';
}

const STAGES: Array<{ key: string; title: string; statuses: LoanStatus[]; when?: (p: Pick<LoanProduct, 'suretiesRequired' | 'ddoCertificationRequired'>) => boolean }> = [
  { key: 'submitted', title: 'Submitted', statuses: ['DRAFT'] },
  { key: 'surety', title: 'Surety confirmation', statuses: ['SURETY_PENDING'], when: (p) => p.suretiesRequired > 0 },
  { key: 'accountant', title: 'Validation by Accountant', statuses: ['ACCOUNTANT_REVIEW'] },
  { key: 'ddo', title: 'Validation by DDO', statuses: ['DDO_CERTIFICATION'], when: (p) => p.ddoCertificationRequired },
  { key: 'assessment', title: 'Loan assessment', statuses: ['ASSESSMENT'] },
  { key: 'sanction', title: 'Sanction (Secretary · President)', statuses: ['SANCTION_SECRETARY', 'SANCTION_PRESIDENT'] },
  { key: 'disbursement', title: 'Disbursement', statuses: ['SANCTIONED'] },
];

export interface LoanStageView {
  key: string;
  title: string;
  status: 'done' | 'current' | 'todo' | 'failed' | 'attention';
  date?: ISODate;
  by?: string;
}

/**
 * MB-04 / ST-23 stage tracker. Steps the product skips are left out (D-030). A returned loan sits on
 * the stage that returned it ("attention"); a rejected or withdrawn one on the stage where it stopped.
 */
export function loanStages(product: Pick<LoanProduct, 'suretiesRequired' | 'ddoCertificationRequired'>, loan: { status: LoanStatus; events: WorkflowEvent[] }): LoanStageView[] {
  const stages = STAGES.filter((s) => !s.when || s.when(product));
  const done = loan.status === 'ACTIVE' || loan.status === 'CLOSED' || loan.status === 'CLOSED_BY_TOPUP';
  const stopped = ['RETURNED', 'REJECTED', 'WITHDRAWN'].includes(loan.status);
  const anchorStatus = stopped ? (loan.events.at(-1)?.fromStatus as LoanStatus | undefined) : loan.status;
  const idx = done ? stages.length : Math.max(0, stages.findIndex((s) => anchorStatus !== undefined && s.statuses.includes(anchorStatus)));
  return stages.map((s, i) => {
    const left = loan.events.find((e) => e.fromStatus && s.statuses.includes(e.fromStatus as LoanStatus) && !['returnToMember', 'reject', 'withdraw'].includes(e.action));
    const meta = left ? { date: left.at.slice(0, 10), by: left.actorName } : {};
    if (i < idx) return { key: s.key, title: s.title, status: 'done', ...meta };
    if (i === idx) {
      if (loan.status === 'RETURNED') return { key: s.key, title: s.title, status: 'attention' };
      if (stopped) return { key: s.key, title: s.title, status: 'failed' };
      if (loan.status === 'DRAFT') return { key: s.key, title: 'Draft, not submitted yet', status: 'current' };
      return { key: s.key, title: s.title, status: 'current' };
    }
    return { key: s.key, title: s.title, status: 'todo' };
  });
}
