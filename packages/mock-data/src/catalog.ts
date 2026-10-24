// Reference lists for the generator. ALL names are FICTIONAL combinations (no real people).
import type { LoanProduct, Paise, SocietySettings } from '@tgs/types';

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
  { code: 'ORDINARY', name: 'Ordinary Loan', ratePercent: 11, maxAmount: R(500000), maxInstalments: 100, suretiesRequired: 2, ddoCertificationRequired: true, shareDepositPercent: 10, topupAllowed: true, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'EDUCATION', name: 'Education Loan', ratePercent: 9, maxAmount: R(300000), maxInstalments: 60, suretiesRequired: 2, ddoCertificationRequired: true, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'SALARY', name: 'Salary Loan', ratePercent: 12, maxAmount: R(100000), maxInstalments: 24, suretiesRequired: 0, ddoCertificationRequired: false, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
  { code: 'DEPOSIT', name: 'Loan against Deposit', ratePercent: 10, maxAmount: R(450000), maxInstalments: 36, suretiesRequired: 0, ddoCertificationRequired: false, shareDepositPercent: 0, topupAllowed: false, emiMethod: 'EQUAL_PRINCIPAL', placeholder: true },
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
  placeholders: ['shareValue', 'insurance.collectionMonth', 'rrfMonthly', 'crdMonthly', 'srdsMonthly', 'retirementAge', 'defaulterCycles', 'fdSlabs', 'savingsRatePercent', 'loanProducts'],
};

export const LOAN_PURPOSES = {
  ORDINARY: ['House repair', 'Marriage expenses', 'Medical expenses', 'Vehicle purchase', 'Household needs', 'Debt consolidation'],
  EDUCATION: ['B.Tech fees', 'MBBS fees', 'Intermediate fees', 'M.Sc fees', 'Coaching fees'],
  SALARY: ['Festival advance', 'Short-term need', 'Medical emergency'],
  DEPOSIT: ['Against fixed deposit', 'Short-term need'],
} as const;
