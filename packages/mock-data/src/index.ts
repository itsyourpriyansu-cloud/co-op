// @tgs/mock-data: deterministic, fictional seed (docs/13). M0 ships personas + masters;
// the full generator (600 members, loans, deposits, 12 demand cycles) arrives in M1.
import type {
  ApplicantSummary,
  Department,
  MemberSummary,
  Persona,
  SocietyProfile,
  StaffUser,
} from '@tgs/types';
import { departments } from './departments';
import { applicants, members, personas, staffUsers } from './personas';
import { society } from './society';

/** Bump when the seed shape changes: the mock API reseeds snapshots with an older version. */
export const SEED_VERSION = 1;
export const SEED = 20260705;

export interface Seed {
  version: number;
  society: SocietyProfile;
  departments: Department[];
  staffUsers: StaffUser[];
  members: MemberSummary[];
  applicants: ApplicantSummary[];
  personas: Persona[];
}

/** Always returns fresh copies, so a reset never shares references with mutated state. */
export function createSeed(): Seed {
  return structuredClone({
    version: SEED_VERSION,
    society,
    departments,
    staffUsers,
    members,
    applicants,
    personas,
  });
}

export { society, departments, staffUsers, members, applicants, personas };
