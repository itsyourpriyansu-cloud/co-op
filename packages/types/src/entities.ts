// Core entities needed by M0. The full model (docs/08-data-model.md) is added milestone by milestone.
import type { ConsoleRole } from './roles';

/** ISO calendar date `YYYY-MM-DD`. */
export type ISODate = string;
/** Demand cycle `YYYY-MM`. */
export type Cycle = string;
/** Money is always integer paise (D-018). */
export type Paise = number;

export interface SocietyProfile {
  name: string;
  shortName: string;
  registrationNo: string;
  address: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  kind: 'SECRETARY_DEPT' | 'EXTERNAL_OFFICE';
  ddoName: string;
  ddoDesignation: string;
}

export interface StaffUser {
  id: string;
  name: string;
  userId: string;
  role: ConsoleRole;
  departmentId?: string;
}

export interface MemberSummary {
  id: string;
  /** "General No." printed on every society form (Q-501). */
  generalNo: string;
  name: string;
  departmentId: string;
  designation: string;
  mobileMasked: string;
}

export interface ApplicantSummary {
  id: string;
  name: string;
  mobileMasked: string;
}
