import type { ApplicantSummary, Persona, StaffUser } from '@tgs/types';

// Demo personas (docs/13 §2, §6). ALL names and numbers are FICTIONAL.

export const staffUsers: StaffUser[] = [
  { id: 'stf-admin', name: 'Anitha Rao', userId: 'admin', role: 'SUPER_ADMIN' },
  { id: 'stf-accountant', name: 'Suresh Goud', userId: 'accounts', role: 'ACCOUNTANT' },
  { id: 'stf-secretary', name: 'Padma Reddy', userId: 'secretary', role: 'SECRETARY' },
  { id: 'stf-president', name: 'Narasimha Rao', userId: 'president', role: 'PRESIDENT' },
  { id: 'stf-cashier', name: 'Venkat Naidu', userId: 'cashier', role: 'CASHIER' },
  { id: 'stf-ddo-fin', name: 'Kiran Kumar', userId: 'ddo.fin', role: 'DDO', departmentId: 'dept-fin' },
];

/** Members whose stories the demo depends on. The generator applies these overrides. */
export const PERSONA_MEMBERS = {
  lakshmi: { generalNo: '1101', name: 'Lakshmi Devi', gender: 'F', departmentId: 'dept-fin', designation: 'Section Officer' },
  ramaiah: { generalNo: '1102', name: 'Ramaiah Chary', gender: 'M', departmentId: 'dept-rev', designation: 'Assistant Section Officer' },
  sravani: { generalNo: '1103', name: 'Sravani M', gender: 'F', departmentId: 'dept-fin', designation: 'Junior Assistant' },
  mahesh: { generalNo: '1104', name: 'Mahesh Babu P', gender: 'M', departmentId: 'dept-gad', designation: 'Senior Assistant' },
} as const;

export const applicants: ApplicantSummary[] = [
  { id: 'apl-ravi', name: 'Ravi Teja K', mobileMasked: '90XXXXXX11' },
  { id: 'apl-divya', name: 'Divya S', mobileMasked: '90XXXXXX12' },
];

const staffStories: Record<string, string> = {
  'stf-admin': 'Dashboard, settings, users, reports',
  'stf-accountant': 'Reviews, assessment, demand sheets, recoveries',
  'stf-secretary': 'First sign-off on loans, FDs and memberships',
  'stf-president': 'Final sign-off on loans, FDs and memberships',
  'stf-cashier': 'Cash receipts with denominations, disbursements',
  'stf-ddo-fin': 'Certifies Finance department applications',
};

export const personas: Persona[] = [
  ...staffUsers.map((u) => ({ id: u.id, name: u.name, role: u.role, channel: 'console' as const, story: staffStories[u.id] ?? '' })),
  { id: 'mem-1101', name: PERSONA_MEMBERS.lakshmi.name, role: 'MEMBER', channel: 'app', story: 'Active ₹10,000 loan, top-up example from the agreement' },
  { id: 'mem-1102', name: PERSONA_MEMBERS.ramaiah.name, role: 'MEMBER', channel: 'app', story: 'Retires in 14 months, long loans get blocked' },
  { id: 'mem-1103', name: PERSONA_MEMBERS.sravani.name, role: 'MEMBER', channel: 'app', story: 'No loan yet, has a surety request waiting' },
  { id: 'mem-1104', name: PERSONA_MEMBERS.mahesh.name, role: 'MEMBER', channel: 'app', story: 'Short salary recovery, allocation waterfall' },
  { id: 'apl-ravi', name: 'Ravi Teja K', role: 'APPLICANT', channel: 'app', story: 'Membership application at department verification' },
  { id: 'apl-divya', name: 'Divya S', role: 'APPLICANT', channel: 'app', story: 'New applicant, full joining journey' },
];
