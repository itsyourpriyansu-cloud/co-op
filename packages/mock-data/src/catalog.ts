// Reference lists for the generator. ALL names are FICTIONAL combinations (no real people).
import type { LoanProduct, NotificationTemplate, Paise, SocietySettings } from '@tgs/types';

const R = (rupees: number): Paise => rupees * 100;

export const FIRST_NAMES_F = [
  'Lakshmi', 'Sravani', 'Padma', 'Anitha', 'Swapna', 'Madhavi', 'Jyothi', 'Sunitha', 'Rajeshwari', 'Shailaja',
  'Kavitha', 'Bhavani', 'Haritha', 'Deepika', 'Sirisha', 'Mounika', 'Pravallika', 'Sandhya', 'Vani', 'Anuradha',
  'Sujatha', 'Radhika', 'Keerthi', 'Divya', 'Pooja', 'Aruna', 'Geetha', 'Hema', 'Indira', 'Kalyani',
] as const;

export const FIRST_NAMES_M = [
  'Ramaiah', 'Mahesh', 'Suresh', 'Venkat', 'Kiran', 'Srinivas', 'Prakash', 'Ravinder', 'Narender', 'Chandra Shekar',
  'Mallesham', 'Venu Gopal', 'Raju', 'Satish', 'Naresh', 'Anil', 'Praveen', 'Harish', 'Ramesh', 'Vamshi',
  'Nagaraju', 'Bhaskar', 'Sridhar', 'Krishna', 'Shiva', 'Rajesh', 'Mohan', 'Ravi Teja', 'Sai Kumar', 'Yadagiri',
] as const;

export const SURNAMES = [
  'Rao', 'Reddy', 'Goud', 'Naidu', 'Chary', 'Kumar', 'Devi', 'Sharma', 'Yadav', 'Varma',
  'Prasad', 'Murthy', 'Babu', 'Rani', 'Latha', 'Swamy', 'Chowdary', 'Raju', 'Sastry', 'Patel',
] as const;

export const CITIES = [
  { city: 'Hyderabad', district: 'Hyderabad', pin: '5000' },
  { city: 'Secunderabad', district: 'Hyderabad', pin: '5000' },
  { city: 'Kukatpally', district: 'Medchal-Malkajgiri', pin: '5000' },
  { city: 'LB Nagar', district: 'Ranga Reddy', pin: '5000' },
  { city: 'Uppal', district: 'Medchal-Malkajgiri', pin: '5000' },
  { city: 'Miyapur', district: 'Ranga Reddy', pin: '5000' },
] as const;

export const STREETS = ['Gandhi Nagar', 'Vidya Nagar', 'Ashok Nagar', 'Srinagar Colony', 'Saidabad', 'Ameerpet', 'Malkajgiri', 'Dilsukhnagar', 'Tarnaka', 'Kothapet'] as const;

/** Secretariat designations with FICTIONAL pay bands (gross, rupees). */
export const DESIGNATIONS = [
  { title: 'Office Subordinate', weight: 10, scale: '19000-58850', gross: [24000, 42000] },
  { title: 'Record Assistant', weight: 8, scale: '22240-67300', gross: [30000, 48000] },
  { title: 'Junior Assistant', weight: 20, scale: '24280-72850', gross: [36000, 62000] },
  { title: 'Senior Assistant', weight: 22, scale: '32810-96890', gross: [52000, 86000] },
  { title: 'Assistant Section Officer', weight: 18, scale: '42300-115270', gross: [68000, 112000] },
  { title: 'Section Officer', weight: 14, scale: '54220-133630', gross: [88000, 138000] },
  { title: 'Assistant Secretary', weight: 6, scale: '73270-171640', gross: [118000, 176000] },
  { title: 'Deputy Secretary', weight: 2, scale: '89720-180370', gross: [140000, 196000] },
] as const;

/** Loan products. Values marked placeholder until the society confirms them (docs/13 §3, Q-311). */
export const LOAN_PRODUCTS: LoanProduct[] = [
  { code: 'ORDINARY', name: 'Ordinary Loan', ratePercent: 11, minAmount: R(10000), maxAmount: R(500000), maxInstalments: 100, maxConcurrent: 1, depositMarginPercent: 0, penalRatePercent: 0, suretiesRequired: 2, ddoCertificationRequired: true, shareDepositPercent: 10, topupAllowed: true, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'EDUCATION', name: 'Education Loan', ratePercent: 9, minAmount: R(10000), maxAmount: R(300000), maxInstalments: 60, maxConcurrent: 1, depositMarginPercent: 0, penalRatePercent: 0, suretiesRequired: 2, ddoCertificationRequired: true, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'SALARY', name: 'Salary Loan', ratePercent: 12, minAmount: R(5000), maxAmount: R(100000), maxInstalments: 24, maxConcurrent: 1, depositMarginPercent: 0, penalRatePercent: 0, suretiesRequired: 0, ddoCertificationRequired: false, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'DEPOSIT', name: 'Loan against Deposit', ratePercent: 10, minAmount: R(10000), maxAmount: R(450000), maxInstalments: 36, maxConcurrent: 2, depositMarginPercent: 90, penalRatePercent: 0, suretiesRequired: 0, ddoCertificationRequired: false, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
];

export const SETTINGS: SocietySettings = {
  shareValue: R(100),
  insurance: { loaneeAmount: R(1000), nonLoaneeAmount: R(200), collectionMonth: 4 },
  rrfMonthly: R(100),
  crdMonthly: R(500),
  srdsMonthly: R(300),
  retirementAge: 61,
  defaulterCycles: 3,
  fdSlabs: [
    { fromMonths: 12, toMonths: 23, ratePercent: 7 },
    { fromMonths: 24, toMonths: 35, ratePercent: 7.25 },
    { fromMonths: 36, toMonths: 60, ratePercent: 7.5 },
  ],
  savingsRatePercent: 4,
  fdMinAmount: 1_000_000,
  crdRatePercent: 6,
  srdsRatePercent: 6.5,
  minShares: 10,
  maxShares: 100,
  admissionFee: 0,
  maxGuaranteesPerSurety: 2,
  emiToNetSalaryMaxPercent: 50,
  penalGraceDays: 0,
  financialYearStartMonth: 4,
  placeholders: ['shareValue', 'insurance.collectionMonth', 'rrfMonthly', 'crdMonthly', 'srdsMonthly', 'retirementAge', 'defaulterCycles', 'fdSlabs', 'savingsRatePercent', 'fdMinAmount', 'crdRatePercent', 'srdsRatePercent', 'minShares', 'maxShares', 'admissionFee', 'maxGuaranteesPerSurety', 'emiToNetSalaryMaxPercent', 'loanProducts'],
};

export const LOAN_PURPOSES = {
  ORDINARY: ['House repair', 'Marriage expenses', 'Medical expenses', 'Vehicle purchase', 'Household needs', 'Debt consolidation'],
  EDUCATION: ['B.Tech fees', 'MBBS fees', 'Intermediate fees', 'M.Sc fees', 'Coaching fees'],
  SALARY: ['Festival advance', 'Short-term need', 'Medical emergency'],
  DEPOSIT: ['Against fixed deposit', 'Short-term need'],
} as const;

/** ST-63 notification templates. Sending is simulated: in-app always, other channels are logged. */
export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { key: 'membership.stage', event: 'Membership application moves to a new stage', title: 'Application update', body: 'Hello {name}, your membership application {applicationNo} is now at: {stage}.', channels: ['IN_APP', 'SMS'], audience: 'APPLICANT' },
  { key: 'membership.active', event: 'Membership activated', title: 'Welcome to the society', body: 'Welcome {name}! Your General No. is {generalNo}.', channels: ['IN_APP', 'SMS', 'WHATSAPP'], audience: 'MEMBER' },
  { key: 'profile.approved', event: 'Profile change approved', title: 'Profile updated', body: 'Your request to change {fields} has been approved.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'profile.rejected', event: 'Profile change not approved', title: 'Profile change not approved', body: 'Your request to change {fields} was not approved: {reason}', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'loan.submitted', event: 'Loan application submitted', title: 'Loan application received', body: 'We received your {product} application {applicationNo} for {amount}.', channels: ['IN_APP'], audience: 'MEMBER' },
  { key: 'loan.surety', event: 'Member asked to be a surety', title: 'Surety request', body: '{borrower} asked you to be a surety for a {product} of {amount}. Open the app to respond.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'loan.suretyDeclined', event: 'A surety declined', title: 'Choose another surety', body: '{surety} declined to be a surety for {applicationNo}: {reason}. Choose another member in the app.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'loan.suretiesSigned', event: 'All sureties signed', title: 'Sureties signed', body: 'All sureties signed {applicationNo}. The society office is reviewing it now.', channels: ['IN_APP'], audience: 'MEMBER' },
  { key: 'loan.returned', event: 'Loan returned for correction', title: 'Action needed on your loan', body: 'Your loan {applicationNo} needs a correction: {reason}', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'loan.sanctioned', event: 'Loan sanctioned', title: 'Loan sanctioned', body: 'Your {product} of {amount} is sanctioned. EMI {emi} from {firstCycle}.', channels: ['IN_APP', 'SMS', 'EMAIL'], audience: 'MEMBER' },
  { key: 'loan.disbursed', event: 'Loan disbursed', title: 'Loan disbursed', body: '{netAmount} has been paid for loan {loanNo}.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'loan.rejected', event: 'Loan rejected', title: 'Loan not approved', body: 'Your loan {applicationNo} was not approved: {reason}', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'fd.rejected', event: 'Fixed deposit not accepted', title: 'Deposit not accepted', body: 'Your fixed deposit request {requestNo} was not accepted: {reason}. The money will be refunded.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'fd.accepted', event: 'Fixed deposit accepted', title: 'Fixed deposit accepted', body: 'FD {fdrNo} for {amount} is active. Matures on {maturityDate}.', channels: ['IN_APP', 'EMAIL'], audience: 'MEMBER' },
  { key: 'fd.maturing', event: 'Fixed deposit maturing in 30 days', title: 'FD maturing soon', body: 'FD {fdrNo} matures on {maturityDate}. Visit the office to renew or withdraw.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'recovery.posted', event: 'Monthly recovery posted', title: 'Deduction recovered', body: '{amount} was recovered from your {cycle} salary.', channels: ['IN_APP'], audience: 'MEMBER' },
  { key: 'recovery.short', event: 'Short recovery', title: 'Short recovery', body: 'Only {recovered} of {demand} was recovered for {cycle}. See how it was applied.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'payment.verified', event: 'Reported payment verified', title: 'Payment verified', body: 'Your payment of {amount} (ref {reference}) is verified. Receipt {receiptNo}.', channels: ['IN_APP'], audience: 'MEMBER' },
  { key: 'payment.rejected', event: 'Reported payment rejected', title: 'Payment not verified', body: 'We could not verify your payment of {amount}: {reason}', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'defaulter.notice', event: 'Defaulter notice (ST-52, Q-310 wording placeholder)', title: 'Overdue dues: {overdue}', body: 'Our records show that {overdue} due to the society from your salary deductions has not been recovered in full for {cycles} month(s), as detailed below. Please pay this amount at the society counter or by bank transfer within 15 days of this notice, and report the payment in the member app. If it is not paid, the society will recover it from your salary and, where applicable, from your sureties, as per the bye-laws and your agreement with the society.', channels: ['IN_APP', 'SMS'], audience: 'MEMBER' },
  { key: 'dues.reminder', event: 'Dues reminder (composer)', title: 'Dues reminder', body: 'Dear {name} (General No. {generalNo}), {overdue} is unpaid on your society account. Please pay at the counter or by bank transfer and report it in the app.', channels: ['SMS', 'WHATSAPP'], audience: 'MEMBER' },
  { key: 'demand.sent', event: 'Demand sheet sent to the DDO', title: 'Demand sheet for {cycle}', body: 'The {cycle} demand for {department} ({members} members, {amount}) is ready to deduct.', channels: ['EMAIL'], audience: 'STAFF' },
];
