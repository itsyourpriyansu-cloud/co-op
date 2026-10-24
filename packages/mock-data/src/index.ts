// @tgs/mock-data: the deterministic, fictional demo dataset (docs/13, docs/20).
import type {
  ApplicantSummary,
  Department,
  LoanProduct,
  Persona,
  Scenario,
  SocietyProfile,
  SocietySettings,
  StaffUser,
} from '@tgs/types';
import { LOAN_PRODUCTS, SETTINGS } from './catalog';
import { departments } from './departments';
import { CURRENT_CYCLE, DEMAND_CYCLES, generateData, SEED_TODAY, type GeneratedData } from './generate';
import { applicants, personas, staffUsers } from './personas';
import { buildScenarios } from './scenarios';
import { society } from './society';

/** Bump when the dataset shape changes: the mock API reseeds snapshots with an older version. */
export const SEED_VERSION = 2;
export const SEED = 20260705;

export interface Dataset extends GeneratedData {
  version: number;
  /** The date the dataset is anchored to; the demo clock starts here. */
  today: string;
  currentCycle: string;
  demandCycles: string[];
  society: SocietyProfile;
  settings: SocietySettings;
  loanProducts: LoanProduct[];
  departments: Department[];
  staffUsers: StaffUser[];
  applicants: ApplicantSummary[];
  personas: Persona[];
  scenarios: Scenario[];
}

/** @deprecated M0 name. Use Dataset. */
export type Seed = Dataset;

/** Builds a fresh dataset. Deterministic: the same SEED always yields identical data. */
export function createSeed(seed: number = SEED): Dataset {
  const data = generateData(seed);
  return {
    version: SEED_VERSION,
    today: SEED_TODAY,
    currentCycle: CURRENT_CYCLE,
    demandCycles: [...DEMAND_CYCLES],
    society: structuredClone(society),
    settings: structuredClone(SETTINGS),
    loanProducts: structuredClone(LOAN_PRODUCTS),
    departments: structuredClone(departments),
    staffUsers: structuredClone(staffUsers),
    applicants: structuredClone(applicants),
    personas: structuredClone(personas),
    scenarios: buildScenarios(data),
    ...data,
  };
}

export { society, departments, staffUsers, applicants, personas, LOAN_PRODUCTS, SETTINGS, SEED_TODAY, CURRENT_CYCLE };
