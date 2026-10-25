// BR-013 / BR-019 state machines: loans, FDs, demand sheets, membership (docs/10).
import { describe, expect, it } from 'vitest';
import type { DepositStatus, LoanStatus, MembershipStatus } from '@tgs/types';
import {
  demandSheetActionsFor,
  depositActionsFor,
  isLoanInFlight,
  isMembershipInFlight,
  loanActionsFor,
  membershipActionsFor,
  membershipShareAmount,
  nextDemandSheetStatus,
  nextDepositStatus,
  nextLoanStatus,
  nextMembershipStatus,
  primaryMembershipAction,
} from './index';

const F2 = { product: { suretiesRequired: 2, ddoCertificationRequired: true } };
const F3 = { product: { suretiesRequired: 0, ddoCertificationRequired: false } };

describe('loan state machine', () => {
  it('Ordinary (F2): submit → sureties → review → DDO → assessment → Secretary → President → sanctioned → active', () => {
    let s: LoanStatus = 'DRAFT';
    s = nextLoanStatus(s, 'submit', F2)!;
    expect(s).toBe('SURETY_PENDING');
    expect(nextLoanStatus(s, 'suretyAccept', { ...F2, allSuretiesAccepted: false })).toBe('SURETY_PENDING');
    expect(nextLoanStatus(s, 'suretyDecline', F2)).toBe('SURETY_PENDING');
    s = nextLoanStatus(s, 'suretyAccept', { ...F2, allSuretiesAccepted: true })!;
    s = nextLoanStatus(s, 'forward', F2)!;
    expect(s).toBe('DDO_CERTIFICATION');
    s = nextLoanStatus(s, 'ddoCertify', F2)!;
    s = nextLoanStatus(s, 'sendForSanction', F2)!;
    s = nextLoanStatus(s, 'secretarySign', F2)!;
    expect(nextLoanStatus(s, 'sendBack', F2)).toBe('ASSESSMENT');
    s = nextLoanStatus(s, 'presidentSign', F2)!;
    expect(nextLoanStatus(s, 'disburse', F2)).toBe('ACTIVE');
  });
  it('Salary (F3): no sureties, no DDO', () => {
    expect(nextLoanStatus('DRAFT', 'submit', F3)).toBe('ACCOUNTANT_REVIEW');
    expect(nextLoanStatus('ACCOUNTANT_REVIEW', 'forward', F3)).toBe('ASSESSMENT');
    expect(nextLoanStatus('DDO_CERTIFICATION', 'ddoRecordManual', F3)).toBe('ASSESSMENT');
  });
  it('return, resubmit, withdraw, reject', () => {
    expect(nextLoanStatus('ASSESSMENT', 'returnToMember', F2)).toBe('RETURNED');
    expect(nextLoanStatus('RETURNED', 'resubmit', { ...F2, allSuretiesAccepted: true })).toBe('ACCOUNTANT_REVIEW');
    expect(nextLoanStatus('RETURNED', 'resubmit', { ...F2, allSuretiesAccepted: false })).toBe('SURETY_PENDING');
    expect(nextLoanStatus('RETURNED', 'withdraw', F2)).toBe('WITHDRAWN');
    expect(nextLoanStatus('SANCTION_PRESIDENT', 'reject', F2)).toBe('REJECTED');
  });
  it('invalid transitions return undefined', () => {
    const bad: Array<[LoanStatus, Parameters<typeof nextLoanStatus>[1]]> = [
      ['ACTIVE', 'submit'], ['DRAFT', 'resubmit'], ['ACTIVE', 'withdraw'], ['DRAFT', 'suretyAccept'], ['DRAFT', 'suretyDecline'], ['DRAFT', 'forward'],
      ['SANCTIONED', 'returnToMember'], ['SANCTIONED', 'reject'], ['ASSESSMENT', 'ddoCertify'], ['DRAFT', 'sendForSanction'], ['DRAFT', 'secretarySign'],
      ['DRAFT', 'presidentSign'], ['DRAFT', 'sendBack'], ['DRAFT', 'disburse'],
    ];
    for (const [s, a] of bad) expect(nextLoanStatus(s, a, F2), `${s} ${a}`).toBeUndefined();
  });
  it('actions per role, DDO limited to own department (BR-019)', () => {
    const at = (status: LoanStatus) => ({ status, memberDepartmentId: 'dept-fin' });
    expect(loanActionsFor(at('ACCOUNTANT_REVIEW'), { role: 'ACCOUNTANT' })).toContain('forward');
    expect(loanActionsFor(at('ACCOUNTANT_REVIEW'), { role: 'SECRETARY' })).toEqual([]);
    expect(loanActionsFor(at('DDO_CERTIFICATION'), { role: 'DDO', departmentId: 'dept-fin' })).toContain('ddoCertify');
    expect(loanActionsFor(at('DDO_CERTIFICATION'), { role: 'DDO', departmentId: 'dept-rev' })).toEqual([]);
    expect(loanActionsFor(at('DDO_CERTIFICATION'), { role: 'ACCOUNTANT' })).toEqual(['ddoRecordManual']);
    expect(loanActionsFor(at('DDO_CERTIFICATION'), { role: 'CASHIER' })).toEqual([]);
    expect(loanActionsFor(at('ASSESSMENT'), { role: 'ACCOUNTANT' })).toContain('sendForSanction');
    expect(loanActionsFor(at('ASSESSMENT'), { role: 'CASHIER' })).toEqual([]);
    expect(loanActionsFor(at('SANCTION_SECRETARY'), { role: 'SECRETARY' })).toContain('secretarySign');
    expect(loanActionsFor(at('SANCTION_SECRETARY'), { role: 'PRESIDENT' })).toEqual([]);
    expect(loanActionsFor(at('SANCTION_PRESIDENT'), { role: 'PRESIDENT' })).toContain('presidentSign');
    expect(loanActionsFor(at('SANCTION_PRESIDENT'), { role: 'SECRETARY' })).toEqual([]);
    expect(loanActionsFor(at('SANCTIONED'), { role: 'CASHIER' })).toEqual(['disburse']);
    expect(loanActionsFor(at('SANCTIONED'), { role: 'ACCOUNTANT' })).toEqual([]);
    expect(loanActionsFor(at('ACTIVE'), { role: 'ACCOUNTANT' })).toEqual([]);
    expect(isLoanInFlight('RETURNED')).toBe(true);
    expect(isLoanInFlight('ACTIVE')).toBe(false);
  });
});

describe('FD state machine', () => {
  it('request → payment → Secretary → President → active, with refund and payout paths', () => {
    expect(nextDepositStatus('REQUESTED', 'recordPayment')).toBe('ACCEPTANCE_SECRETARY');
    expect(nextDepositStatus('REQUESTED', 'cancel')).toBe('CANCELLED');
    expect(nextDepositStatus('PAYMENT_RECEIVED', 'accept')).toBe('ACCEPTANCE_PRESIDENT');
    expect(nextDepositStatus('ACCEPTANCE_SECRETARY', 'accept')).toBe('ACCEPTANCE_PRESIDENT');
    expect(nextDepositStatus('ACCEPTANCE_PRESIDENT', 'accept')).toBe('ACTIVE');
    expect(nextDepositStatus('ACCEPTANCE_PRESIDENT', 'reject')).toBe('REFUND_PENDING');
    expect(nextDepositStatus('REFUND_PENDING', 'refund')).toBe('CANCELLED');
    expect(nextDepositStatus('MATURED', 'payout')).toBe('CLOSED');
    const bad: Array<[DepositStatus, Parameters<typeof nextDepositStatus>[1]]> = [['ACTIVE', 'recordPayment'], ['ACTIVE', 'cancel'], ['REQUESTED', 'accept'], ['REQUESTED', 'reject'], ['ACTIVE', 'refund'], ['ACTIVE', 'payout']];
    for (const [s, a] of bad) expect(nextDepositStatus(s, a), `${s} ${a}`).toBeUndefined();
  });
  it('actions per owner', () => {
    expect(depositActionsFor('REQUESTED', { role: 'CASHIER' })).toEqual(['recordPayment', 'cancel']);
    expect(depositActionsFor('ACCEPTANCE_SECRETARY', { role: 'SECRETARY' })).toEqual(['accept', 'reject']);
    expect(depositActionsFor('ACCEPTANCE_PRESIDENT', { role: 'SECRETARY' })).toEqual([]);
    expect(depositActionsFor('REFUND_PENDING', { role: 'CASHIER' })).toEqual(['refund']);
    expect(depositActionsFor('MATURED', { role: 'CASHIER' })).toEqual(['payout']);
    expect(depositActionsFor('ACTIVE', { role: 'CASHIER' })).toEqual([]);
  });
});

describe('demand sheet state machine (BR-030)', () => {
  it('generated → certified → sent → posted, accountant only', () => {
    expect(demandSheetActionsFor('GENERATED', { role: 'ACCOUNTANT' })).toEqual(['certify']);
    expect(demandSheetActionsFor('CERTIFIED', { role: 'ACCOUNTANT' })).toEqual(['sendToDdo']);
    expect(demandSheetActionsFor('SENT_TO_DDO', { role: 'ACCOUNTANT' })).toEqual(['postRecovery']);
    expect(demandSheetActionsFor('RECOVERY_POSTED', { role: 'ACCOUNTANT' })).toEqual([]);
    expect(demandSheetActionsFor('GENERATED', { role: 'DDO' })).toEqual([]);
    expect(nextDemandSheetStatus('GENERATED', 'certify')).toBe('CERTIFIED');
    expect(nextDemandSheetStatus('CERTIFIED', 'sendToDdo')).toBe('SENT_TO_DDO');
    expect(nextDemandSheetStatus('SENT_TO_DDO', 'postRecovery')).toBe('RECOVERY_POSTED');
    expect(nextDemandSheetStatus('CERTIFIED', 'certify')).toBeUndefined();
    expect(nextDemandSheetStatus('GENERATED', 'sendToDdo')).toBeUndefined();
    expect(nextDemandSheetStatus('GENERATED', 'postRecovery')).toBeUndefined();
  });
});

describe('membership state machine (D-053)', () => {
  it('owners, actions and transitions', () => {
    const app = (status: MembershipStatus, route?: 'COUNTER' | 'FIRST_DEMAND') => ({ status, departmentId: 'dept-fin', ...(route ? { sharePaymentRoute: route } : {}) });
    expect(membershipActionsFor(app('SUBMITTED'), { role: 'ACCOUNTANT' })).toContain('sendToDdo');
    expect(membershipActionsFor(app('DDO_CERTIFICATION'), { role: 'DDO', departmentId: 'dept-rev' })).toEqual([]);
    expect(membershipActionsFor(app('DDO_CERTIFICATION'), { role: 'DDO', departmentId: 'dept-fin' })).toContain('certify');
    expect(membershipActionsFor(app('OFFICE_REVIEW'), { role: 'ACCOUNTANT' })).toContain('forward');
    expect(membershipActionsFor(app('APPROVAL_PRESIDENT'), { role: 'PRESIDENT' })).toContain('approve');
    expect(membershipActionsFor(app('APPROVAL_SECRETARY'), { role: 'SECRETARY' })).toEqual(['approve', 'reject']);
    expect(membershipActionsFor(app('SHARE_PAYMENT_PENDING', 'FIRST_DEMAND'), { role: 'CASHIER' })).toEqual(['activate']);
    expect(membershipActionsFor(app('SHARE_PAYMENT_PENDING'), { role: 'CASHIER' })).toEqual(['recordSharePayment']);
    expect(membershipActionsFor(app('INFO_REQUESTED'), { role: 'APPLICANT' })).toEqual([]);
    expect(membershipActionsFor(app('ACTIVE'), { role: 'ACCOUNTANT' })).toEqual([]);
    expect(primaryMembershipAction('SHARE_PAYMENT_PENDING', 'FIRST_DEMAND')).toBe('activate');
    expect(primaryMembershipAction('ACTIVE')).toBeUndefined();
    expect(nextMembershipStatus('OFFICE_REVIEW', 'reject')).toBe('REJECTED');
    expect(nextMembershipStatus('DDO_CERTIFICATION', 'reject')).toBeUndefined();
    expect(nextMembershipStatus('DDO_CERTIFICATION', 'returnToApplicant')).toBe('INFO_REQUESTED');
    expect(nextMembershipStatus('APPROVAL_SECRETARY', 'returnToApplicant')).toBeUndefined();
    expect(nextMembershipStatus('APPROVAL_PRESIDENT', 'approve')).toBe('SHARE_PAYMENT_PENDING');
    expect(nextMembershipStatus('SHARE_PAYMENT_PENDING', 'activate')).toBe('ACTIVE');
    expect(nextMembershipStatus('SUBMITTED', 'certify')).toBeUndefined();
    expect(nextMembershipStatus('ACTIVE', 'approve')).toBeUndefined();
    expect(isMembershipInFlight('ACTIVE')).toBe(false);
    expect(membershipShareAmount(20, toPaise100)).toBe(200000);
  });
});

const toPaise100 = 10000;
