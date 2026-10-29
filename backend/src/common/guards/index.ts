import type { Role } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { fail } from '../errors/app-error';

// Route guards (preHandler hooks). Every role/scope check happens on the server (docs/03 §4).
// The session is attached to `request.session` by the auth plugin built in P1; until then
// no request carries one, so guarded routes answer UNAUTHENTICATED.

export interface RequestSession {
  userId: string;
  role: Role;
  memberId?: string;
  departmentId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    session?: RequestSession;
  }
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.session) fail('UNAUTHENTICATED', 'Please sign in again.');
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    if (!roles.includes(request.session!.role)) fail('FORBIDDEN', 'You do not have access to this action.');
  };
}

/** DDO scope (docs/03 R5): a DDO may only touch their own department. Other staff roles pass. */
export function assertDepartmentScope(request: FastifyRequest, departmentId: string): void {
  const s = request.session;
  if (s?.role === 'DDO' && s.departmentId !== departmentId) {
    fail('FORBIDDEN', 'This record belongs to another department.');
  }
}
