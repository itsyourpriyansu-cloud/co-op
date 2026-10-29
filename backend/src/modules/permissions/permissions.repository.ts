import type { Permission, Role } from '@tgs/types';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { Tx } from '../../db/transaction';
import { rolePermissions } from '../../models';

export class PermissionsRepository {
  constructor(private readonly db: Database) {}

  async all(): Promise<Array<{ role: Role; permission: Permission }>> {
    return this.db.select().from(rolePermissions);
  }

  async replaceForRole(tx: Tx, role: Role, permissions: Permission[]): Promise<void> {
    await tx.delete(rolePermissions).where(eq(rolePermissions.role, role));
    if (permissions.length) await tx.insert(rolePermissions).values(permissions.map((permission) => ({ role, permission })));
  }
}
