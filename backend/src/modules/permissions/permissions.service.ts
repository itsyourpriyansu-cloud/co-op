import { PERMISSION_LABELS } from '@tgs/domain';
import { CONSOLE_ROLES, ROLE_LABELS, type ConsoleRole, type Permission, type PermissionMatrix, type Role } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import type { Database } from '../../db/client';
import { withTransaction } from '../../db/transaction';
import type { AuditService } from '../audit/audit.service';
import type { PermissionsRepository } from './permissions.repository';

/** Permissions every Super Admin keeps, so nobody can lock the society out of its own settings. */
const SUPER_ADMIN_FLOOR: Permission[] = ['settings.view', 'settings.edit', 'users.manage'];
const KNOWN = new Set(PERMISSION_LABELS.map((p) => p.key));

/**
 * The role → permission matrix (docs/03 §2), cached in memory. Every guard reads the cache;
 * an edit (ST-62) rewrites the table and reloads it.
 */
export class PermissionsService {
  private cache?: Promise<Map<Role, Set<Permission>>>;

  constructor(
    private readonly db: Database,
    private readonly repo: PermissionsRepository,
    private readonly audit: AuditService,
  ) {}

  private load(): Promise<Map<Role, Set<Permission>>> {
    this.cache ??= this.repo.all().then((rows) => {
      const map = new Map<Role, Set<Permission>>();
      for (const { role, permission } of rows) {
        if (!map.has(role)) map.set(role, new Set());
        map.get(role)!.add(permission);
      }
      return map;
    });
    // A failed load must not stay cached.
    this.cache.catch(() => (this.cache = undefined));
    return this.cache;
  }

  /** Forget the cached matrix (after an edit or a demo reset). */
  reload(): void {
    this.cache = undefined;
  }

  async has(role: Role, permission: Permission): Promise<boolean> {
    return (await this.load()).get(role)?.has(permission) ?? false;
  }

  async forRole(role: Role): Promise<Permission[]> {
    return [...((await this.load()).get(role) ?? [])].sort();
  }

  async matrix(): Promise<PermissionMatrix> {
    const map = await this.load();
    return {
      roles: CONSOLE_ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })),
      permissions: PERMISSION_LABELS,
      grants: Object.fromEntries(CONSOLE_ROLES.map((r) => [r, [...(map.get(r) ?? [])].sort()])),
    };
  }

  /** ST-62: replace one console role's permissions. */
  async updateRole(request: FastifyRequest, role: ConsoleRole, permissions: Permission[]): Promise<PermissionMatrix> {
    const unknown = permissions.filter((p) => !KNOWN.has(p));
    if (unknown.length) fail('VALIDATION_ERROR', `Unknown permission: ${unknown.join(', ')}`, { fieldErrors: { permissions: 'Unknown permission' } });
    const next = [...new Set(permissions)];
    if (role === 'SUPER_ADMIN') for (const p of SUPER_ADMIN_FLOOR) if (!next.includes(p)) next.push(p);
    const before = await this.forRole(role);
    await withTransaction(this.db, async (tx) => {
      await this.repo.replaceForRole(tx, role, next);
      await this.audit.record(request, {
        action: 'permissions.update',
        entity: 'permissions',
        entityId: role,
        summary: `Changed permissions for ${ROLE_LABELS[role]}`,
        before,
        after: next.sort(),
      }, tx);
    });
    this.cache = undefined;
    return this.matrix();
  }
}
