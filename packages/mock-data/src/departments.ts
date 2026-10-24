import type { Department } from '@tgs/types';

// Secretariat-style department names (docs/13 §1). DDO names are FICTIONAL.
const rows: Array<[code: string, name: string, ddoName: string]> = [
  ['FIN', 'Finance', 'Kiran Kumar'],
  ['GAD', 'General Administration', 'Sunitha Rani'],
  ['REV', 'Revenue', 'Prakash Reddy'],
  ['HOME', 'Home', 'Madhavi Latha'],
  ['MAUD', 'Municipal Administration & Urban Development', 'Srinivas Goud'],
  ['PRRD', 'Panchayat Raj & Rural Development', 'Rajeshwari Devi'],
  ['SE', 'School Education', 'Venu Gopal'],
  ['HMFW', 'Health, Medical & Family Welfare', 'Anuradha K'],
  ['IRR', 'Irrigation', 'Mallesham P'],
  ['AGRI', 'Agriculture & Co-operation', 'Swapna Reddy'],
  ['ENGY', 'Energy', 'Ravinder Rao'],
  ['IND', 'Industries & Commerce', 'Shailaja M'],
  ['RB', 'Roads & Buildings', 'Narender Kumar'],
  ['TRAN', 'Transport', 'Jyothi Lakshmi'],
  ['LAW', 'Law', 'Chandra Shekar'],
];

export const departments: Department[] = rows.map(([code, name, ddoName]) => ({
  id: `dept-${code.toLowerCase()}`,
  code,
  name,
  kind: 'SECRETARY_DEPT',
  ddoName,
  ddoDesignation: 'Assistant Secretary to Government',
}));
