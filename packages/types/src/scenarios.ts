// Scenario catalog (docs/20): every demoable state, mapped to who sees it, what record proves it,
// and which screen shows it. The State Explorer and test plans read from this list.
import type { Role } from './roles';

export type ScenarioArea =
  | 'membership'
  | 'members'
  | 'loans'
  | 'sureties'
  | 'deposits'
  | 'collections'
  | 'payments'
  | 'profile'
  | 'system';

/** Generic UI states every screen must design for (docs/04 §6, docs/19). */
export const VIEW_STATES = [
  'loading',
  'empty',
  'noResults',
  'error',
  'offline',
  'noAccess',
  'ready',
  'partial',
  'submitting',
  'success',
] as const;
export type ViewState = (typeof VIEW_STATES)[number];

export interface Scenario {
  /** Stable id, e.g. SC-LOAN-SANCTION-PRESIDENT. */
  id: string;
  area: ScenarioArea;
  title: string;
  description: string;
  /** Persona that should sign in to see it. */
  personaId: string;
  role: Role;
  /** Screens where the state is visible (docs/05 ids). */
  screens: string[];
  entityType?: 'member' | 'loan' | 'deposit' | 'demandSheet' | 'membershipApplication' | 'paymentReport' | 'profileChangeRequest' | 'receipt';
  entityId?: string;
  /** The entity status or rule outcome this scenario demonstrates. */
  state: string;
  /** Milestone that builds the screen (docs/14). */
  milestone: string;
}
