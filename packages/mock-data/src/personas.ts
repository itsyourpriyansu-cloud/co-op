import type { ApplicantSummary, MemberSummary, Persona, StaffUser } from '@tgs/types';

// Demo personas (docs/13 §2, §6). ALL names and numbers are FICTIONAL.

export const staffUsers: StaffUser[] = [
  { id: 'stf-admin', name: 'Anitha Rao', userId: 'admin', role: 'SUPER_ADMIN' },
  { id: 'stf-accountant', name: 'Suresh Goud', userId: 'accounts', role: 'ACCOUNTANT' },
  { id: 'stf-secretary', name: 'Padma Reddy', userId: 'secretary', role: 'SECRETARY' },
  { id: 'stf-president', name: 'Narasimha Rao', userId: 'president', role: 'PRESIDENT' },
  { id: 'stf-cashier', name: 'Venkat Naidu', userId: 'cashier', role: 'CASHIER' },
  {
    id: 'stf-ddo-fin',
    name: 'Kiran Kumar',
    userId: 'ddo.fin',
    role: 'DDO',
    departmentId: 'dept-fin',
  },
];

export const members: MemberSummary[] = [
  {
    id: 'mem-1101',
    generalNo: '1101',
    name: 'Lakshmi Devi',
    departmentId: 'dept-fin',
    designation: 'Section Officer',
    mobileMasked: '90XXXXXX01',
  },
  {
    id: 'mem-1102',
    generalNo: '1102',
    name: 'Ramaiah Chary',
    departmentId: 'dept-rev',
    designation: 'Assistant Section Officer',
    mobileMasked: '90XXXXXX02',
  },
  {
    id: 'mem-1103',
    generalNo: '1103',
    name: 'Sravani M',
    departmentId: 'dept-fin',
    designation: 'Junior Assistant',
    mobileMasked: '90XXXXXX03',
  },
  {
    id: 'mem-1104',
    generalNo: '1104',
    name: 'Mahesh Babu P',
    departmentId: 'dept-gad',
    designation: 'Senior Assistant',
    mobileMasked: '90XXXXXX04',
  },
];

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

const memberStories: Record<string, string> = {
  'mem-1101': 'Active loan, top-up example from the agreement',
  'mem-1102': 'Retires in 14 months, long loans get blocked',
  'mem-1103': 'No loan yet, has a surety request waiting',
  'mem-1104': 'Short salary recovery, allocation waterfall',
};

const applicantStories: Record<string, string> = {
  'apl-ravi': 'Membership application at department verification',
  'apl-divya': 'New applicant, full joining journey',
};

export const personas: Persona[] = [
  ...staffUsers.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    channel: 'console' as const,
    story: staffStories[u.id] ?? '',
  })),
  ...members.map((m) => ({
    id: m.id,
    name: m.name,
    role: 'MEMBER' as const,
    channel: 'app' as const,
    story: memberStories[m.id] ?? '',
  })),
  ...applicants.map((a) => ({
    id: a.id,
    name: a.name,
    role: 'APPLICANT' as const,
    channel: 'app' as const,
    story: applicantStories[a.id] ?? '',
  })),
];
