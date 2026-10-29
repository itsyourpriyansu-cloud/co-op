import type { Permission, SessionUser } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { fail } from '../errors/app-error';

// Route guards (preHandler hooks). Every role/scope check happens on the server (docs/03 §4).
// The auth plugin (plugins/auth.ts) puts the signed-in user on `request.session`.

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionUser;
  }
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.session) fail('UNAUTHENTICATED', 'Please sign in again.');
}

/** The signed-in user, or UNAUTHENTICATED. Use inside controllers after a guard. */
export function sessionOf(request: FastifyRequest): SessionUser {
  return request.session ?? fail('UNAUTHENTICATED', 'Please sign in again.');
}

export function requireRole(...roles: SessionUser['role'][]) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    if (!roles.includes(request.session!.role)) fail('FORBIDDEN', 'You do not have access to this action.');
  };
}

/** Checks the role's permissions from role_permissions (cached; docs/03 §2). */
export function requirePermission(permission: Permission, message = 'You do not have access to this action.') {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    const allowed = await request.server.permissions.has(request.session!.role, permission);
    if (!allowed) fail('FORBIDDEN', message);
  };
}

/** DDO scope (docs/03 R5): a DDO may only touch their own department. Other staff roles pass. */
export function assertDepartmentScope(request: FastifyRequest, departmentId: string): void {
  const s = request.session;
  if (s?.role === 'DDO' && s.departmentId !== departmentId) {
    fail('FORBIDDEN', 'This record belongs to another department.');
  }
}
