import { randomInt } from 'node:crypto';
import { checkPassword } from '@tgs/domain';
import { ROLE_LABELS, type ConsoleRole } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { randomToken } from '../../common/utils/crypto';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { withTransaction } from '../../db/transaction';
import type { StaffUserRow, UsersRepository } from './users.repository';
import type { staffUserInput, staffUserSchema } from './users.schema';

type StaffUserOut = z.infer<typeof staffUserSchema>;
type StaffUserIn = z.infer<typeof staffUserInput>;

/** A readable temporary password: 4 letters + 4 digits, shown once to the Super Admin. */
function temporaryPassword(): string {
  const letters = randomToken(8).replace(/[^a-zA-Z]/g, '').slice(0, 4).padEnd(4, 'k');
  const digits = String(randomInt(1000, 10000));
  return `${letters}${digits}`;
}

/** ST-61 staff users (docs/03 R1: only the Super Admin manages them). */
export class UsersService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: UsersRepository,
  ) {}

  async list(): Promise<StaffUserOut[]> {
    const now = new Date();
    return (await this.repo.list()).map((u) => toOut(u, now));
  }

  async create(request: FastifyRequest, input: StaffUserIn): Promise<StaffUserOut[]> {
    if (await this.repo.usernameTaken(input.userId)) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: { userId: 'This user ID is taken.' } });
    const id = `stf-${input.userId.replace(/\./g, '-')}`;
    if (await this.repo.byId(id)) fail('ALREADY_EXISTS', 'A user with this ID already exists.');
    // The account starts with an unknown random password: the Super Admin resets it to hand over a temporary one.
    const passwordHash = await hashPassword(randomToken(24));
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.insert(
        {
          id,
          username: input.userId,
          name: input.name,
          role: input.role,
          departmentId: input.role === 'DDO' ? input.departmentId! : null,
          email: input.email ?? null,
          mobile: input.mobile ?? null,
          passwordHash,
          mustChangePassword: true,
          status: input.active === false ? 'INACTIVE' : 'ACTIVE',
        },
        tx,
      );
      await this.app.audit.record(request, { action: 'users.create', entity: 'user', entityId: id, summary: `Added ${input.name} (${ROLE_LABELS[input.role]})`, after: { ...input } }, tx);
    });
    return this.list();
  }

  async update(request: FastifyRequest, id: string, input: StaffUserIn): Promise<StaffUserOut[]> {
    const current = (await this.repo.byId(id)) ?? fail('NOT_FOUND', 'Unknown user.');
    const me = sessionOf(request);
    if (await this.repo.usernameTaken(input.userId, id)) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: { userId: 'This user ID is taken.' } });
    const active = input.active !== false;
    if (id === me.id && !active) fail('VALIDATION_ERROR', 'You cannot deactivate yourself.', { fieldErrors: { active: 'You cannot deactivate yourself.' } });
    if (id === me.id && input.role !== current.role) fail('VALIDATION_ERROR', 'You cannot change your own role.', { fieldErrors: { role: 'Ask another Super Admin.' } });

    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(
        id,
        {
          name: input.name,
          username: input.userId,
          role: input.role,
          departmentId: input.role === 'DDO' ? input.departmentId! : null,
          email: input.email ?? null,
          mobile: input.mobile ?? null,
          status: active ? 'ACTIVE' : 'INACTIVE',
        },
        tx,
      );
      await this.app.audit.record(
        request,
        {
          action: active ? 'users.update' : 'users.deactivate',
          entity: 'user',
          entityId: id,
          summary: `${active ? 'Updated' : 'Deactivated'} ${input.name}`,
          before: toOut(current, new Date()),
          after: { ...input, active },
        },
        tx,
      );
    });
    // Deactivation or a role change ends the user's sessions at their next refresh (tokens.service).
    if (!active || input.role !== current.role) await this.repo.revokeSessions(id);
    return this.list();
  }

  /** Super Admin hands a temporary password to a user (new user, forgotten password). */
  async resetPassword(request: FastifyRequest, id: string) {
    const user = (await this.repo.byId(id)) ?? fail('NOT_FOUND', 'Unknown user.');
    const temp = temporaryPassword();
    const passwordHash = await hashPassword(temp);
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(id, { passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null }, tx);
      await this.app.audit.record(request, { action: 'users.resetPassword', entity: 'user', entityId: id, summary: `Reset the password of ${user.name}` }, tx);
    });
    await this.repo.revokeSessions(id);
    return { userId: user.username, temporaryPassword: temp, mustChangePassword: true as const };
  }

  /** Lost phone: the user sets up a new authenticator at the next sign-in. */
  async resetTotp(request: FastifyRequest, id: string): Promise<StaffUserOut[]> {
    const user = (await this.repo.byId(id)) ?? fail('NOT_FOUND', 'Unknown user.');
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(id, { totpSecret: null, totpEnabled: false }, tx);
      await this.app.audit.record(request, { action: 'users.resetTotp', entity: 'user', entityId: id, summary: `Reset the authenticator of ${user.name}` }, tx);
    });
    await this.repo.revokeSessions(id);
    return this.list();
  }

  /** The signed-in staff user changes their own password (required after a reset). */
  async changeOwnPassword(request: FastifyRequest, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const me = sessionOf(request);
    const user = (await this.repo.byId(me.id)) ?? fail('UNAUTHENTICATED', 'Please sign in again.');
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      fail('VALIDATION_ERROR', 'Your current password is not right.', { fieldErrors: { currentPassword: 'Wrong password' } });
    }
    const check = checkPassword(newPassword, { mobile: user.mobile ?? undefined, employeeId: user.username });
    if (!check.ok) {
      fail('VALIDATION_ERROR', 'Choose a stronger password.', { fieldErrors: { newPassword: check.checks.find((c) => !c.pass)!.message } });
    }
    if (currentPassword === newPassword) fail('VALIDATION_ERROR', 'Choose a different password.', { fieldErrors: { newPassword: 'Same as the current password' } });
    await withTransaction(this.app.db, async (tx) => {
      await this.repo.update(me.id, { passwordHash: await hashPassword(newPassword), mustChangePassword: false }, tx);
      await this.app.audit.record(request, { action: 'auth.passwordChanged', entity: 'user', entityId: me.id, summary: `${user.name} changed their password` }, tx);
    });
    return { ok: true };
  }
}

function toOut(u: StaffUserRow, now: Date): StaffUserOut {
  return {
    id: u.id,
    name: u.name,
    userId: u.username,
    role: u.role as ConsoleRole,
    ...(u.departmentId ? { departmentId: u.departmentId } : {}),
    ...(u.email ? { email: u.email } : {}),
    ...(u.mobile ? { mobile: u.mobile } : {}),
    active: u.status === 'ACTIVE',
    totpEnabled: u.totpEnabled,
    locked: Boolean(u.lockedUntil && u.lockedUntil > now),
    ...(u.lastLoginAt ? { lastLoginAt: u.lastLoginAt.toISOString() } : {}),
  };
}

