import type { Session, SessionUser } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { withTransaction } from '../../db/transaction';
import type { AccessClaims } from '../../plugins/auth';
import type { AuthRepository } from './auth.repository';
import { appSessionUser, staffSessionUser } from './session-user';

type Subject = 'STAFF' | 'APP';

/**
 * Access tokens (short JWT) + refresh tokens (opaque, stored hashed, rotated on every use).
 * Re-using a refresh token that was already rotated means it leaked: the whole family is revoked.
 */
export class TokensService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: AuthRepository,
  ) {}

  private accessToken(user: SessionUser, subjectType: Subject, subjectId: string): string {
    const claims: AccessClaims = { typ: 'access', user, ...(subjectType === 'APP' ? { aid: subjectId } : {}) };
    return this.app.jwt.sign(claims, { expiresIn: this.app.env.ACCESS_TOKEN_TTL_SECONDS });
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.app.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }

  /** New sign-in: a fresh token family. */
  /** `subjectId`: the staff user or Member App account id (an app account id may differ from the member id). */
  async issue(request: FastifyRequest, subjectType: Subject, user: SessionUser, subjectId = user.id): Promise<Session> {
    const refreshToken = randomToken();
    await this.repo.insertRefresh({
      familyId: crypto.randomUUID(),
      subjectType,
      subjectId,
      tokenHash: sha256(refreshToken),
      device: request.headers['user-agent']?.slice(0, 200) ?? null,
      ip: request.ip,
      expiresAt: this.refreshExpiry(),
    });
    return { token: this.accessToken(user, subjectType, subjectId), refreshToken, expiresInSeconds: this.app.env.ACCESS_TOKEN_TTL_SECONDS, user };
  }

  async refresh(request: FastifyRequest, rawToken: string): Promise<Session> {
    const row = await this.repo.refreshByHash(sha256(rawToken));
    if (!row) fail('UNAUTHENTICATED', 'Please sign in again.');
    if (row!.replacedBy) {
      await this.repo.revokeFamily(row!.familyId);
      await this.app.audit.record(request, {
        action: 'auth.refreshReuse',
        entity: row!.subjectType === 'STAFF' ? 'staffUser' : 'appAccount',
        entityId: row!.subjectId,
        summary: 'A used sign-in token was presented again; all sessions of that sign-in were ended',
        actor: { id: row!.subjectId, name: row!.subjectId },
      });
      fail('UNAUTHENTICATED', 'Please sign in again.');
    }
    if (row!.revokedAt || row!.expiresAt < new Date()) fail('UNAUTHENTICATED', 'Please sign in again.');

    // Load the user fresh: a deactivated user or a changed role takes effect at the next refresh.
    const user = await this.currentUser(row!.subjectType, row!.subjectId);
    const refreshToken = randomToken();
    await withTransaction(this.app.db, async (tx) => {
      const next = await this.repo.insertRefresh(
        {
          familyId: row!.familyId,
          subjectType: row!.subjectType,
          subjectId: row!.subjectId,
          tokenHash: sha256(refreshToken),
          device: request.headers['user-agent']?.slice(0, 200) ?? null,
          ip: request.ip,
          expiresAt: this.refreshExpiry(),
        },
        tx,
      );
      if (!(await this.repo.markRefreshReplaced(row!.id, next.id, tx))) fail('UNAUTHENTICATED', 'Please sign in again.');
    });
    return { token: this.accessToken(user, row!.subjectType, row!.subjectId), refreshToken, expiresInSeconds: this.app.env.ACCESS_TOKEN_TTL_SECONDS, user };
  }

  /** Ends the sign-in this refresh token belongs to (all its rotations). */
  async logout(rawToken: string | undefined, subjectId: string): Promise<void> {
    if (!rawToken) return;
    const row = await this.repo.refreshByHash(sha256(rawToken));
    if (row && (row.subjectId === subjectId || row.subjectType === 'APP')) await this.repo.revokeFamily(row.familyId);
  }

  private async currentUser(subjectType: Subject, id: string): Promise<SessionUser> {
    if (subjectType === 'STAFF') {
      const s = await this.repo.staffById(id);
      if (!s || s.status !== 'ACTIVE') fail('UNAUTHENTICATED', 'This user has been deactivated. Ask the Super Admin.');
      return staffSessionUser(s!);
    }
    const a = await this.repo.appById(id);
    if (!a || a.status !== 'ACTIVE') fail('UNAUTHENTICATED', 'This account is not active. Contact the society office.');
    return appSessionUser(a!);
  }
}
