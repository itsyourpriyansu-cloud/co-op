import type { SessionUser } from '@tgs/types';
import type { AppAccountRow, StaffRow } from './auth.repository';

/** The user as the apps see it (same shape as the mock API's SessionUser). */
export function staffSessionUser(s: StaffRow): SessionUser {
  return { id: s.id, name: s.name, role: s.role, ...(s.departmentId ? { departmentId: s.departmentId } : {}) };
}

export function appSessionUser(a: AppAccountRow): SessionUser {
  return a.kind === 'MEMBER'
    ? { id: a.id, name: a.name, role: 'MEMBER', ...(a.memberId ? { memberId: a.memberId } : {}), ...(a.generalNo ? { generalNo: a.generalNo } : {}) }
    : { id: a.id, name: a.name, role: 'APPLICANT' };
}

export function maskMobile(mobile: string): string {
  return `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`;
}
