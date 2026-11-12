import type { AuditLogEntry, AuditLogList, AuditLogParams, SessionUser } from '@tgs/types';
import { fail } from '../../common/errors/app-error';
import type { FastifyRequest } from 'fastify';
import type { Tx } from '../../db/transaction';
import type { AuditRepository } from './audit.repository';

export interface AuditEvent {
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  /** Who did it. Omit for anonymous events (e.g. a failed sign-in for an unknown username). */
  actor?: Pick<SessionUser, 'id' | 'name'> & { role?: SessionUser['role'] };
}

/** Writes the append-only audit log (docs/07 §7). Call inside the same transaction as the change. */
export class AuditService {
  constructor(readonly repo: AuditRepository) {}

  /** G1 (D-111): the audit log viewer (permission audit.view, checked by the route). */
  async list(p: AuditLogParams): Promise<AuditLogList> {
    const page = Math.max(1, Math.floor(p.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(p.pageSize ?? 50)));
    const [{ items, total }, entities] = await Promise.all([this.repo.list({ ...p, page, pageSize }), this.repo.entities()]);
    return { items, total, page, pageSize, entities };
  }

  async get(id: string): Promise<AuditLogEntry> {
    return (await this.repo.get(id)) ?? fail('NOT_FOUND', 'Audit entry not found.');
  }

  record(request: FastifyRequest | undefined, event: AuditEvent, tx?: Tx): Promise<void> {
    const actor = event.actor ?? request?.session;
    return this.repo.insert(
      {
        action: event.action,
        entity: event.entity,
        entityId: event.entityId ?? null,
        summary: event.summary,
        before: event.before ?? null,
        after: event.after ?? null,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        ip: request?.ip ?? null,
        userAgent: request?.headers['user-agent']?.slice(0, 300) ?? null,
        requestId: request?.id ?? null,
      },
      tx,
    );
  }
}
