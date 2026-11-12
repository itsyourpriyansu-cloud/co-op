import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../tests/helpers/auth';
import { buildTestApp } from '../../tests/helpers/test-app';
import { notificationTemplates, rolePermissions, staffUsers } from '../models';
import { runBootstrap } from './bootstrap';

// G3 (D-113): the production bootstrap fills only what is empty and never touches edited data.
describe('db bootstrap (G3)', () => {
  let app: FastifyInstance;
  const ROLLBACK = new Error('rollback');
  /** Runs `work` in a transaction that is always rolled back, so the shared test database is untouched. */
  const inRollback = async (work: Parameters<FastifyInstance['db']['transaction']>[0]) => {
    await app.db.transaction(async (tx) => {
      await work(tx);
      throw ROLLBACK;
    }).catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
  };

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('changes nothing on a database that is already set up', async () => {
    await inRollback(async (tx) => {
      expect(await runBootstrap(tx, { username: 'first.admin', name: 'First Admin', password: 'Strong2026pass' })).toEqual([]);
    });
  });

  it('refills empty reference tables and creates the first Super Admin with a forced password change', async () => {
    await inRollback(async (tx) => {
      await tx.delete(rolePermissions);
      await tx.delete(notificationTemplates);
      await tx.update(staffUsers).set({ status: 'INACTIVE' }).where(eq(staffUsers.role, 'SUPER_ADMIN'));
      await expect(runBootstrap(tx, { username: 'first.admin', name: 'First Admin', password: 'weak' })).rejects.toThrow(/too weak/);
      const done = await runBootstrap(tx, { username: 'First.Admin', name: 'First Admin', password: 'Strong2026pass' });
      expect(done).toEqual(['role permissions', 'message templates', 'super admin first.admin']);
      const [admin] = await tx.select().from(staffUsers).where(eq(staffUsers.username, 'first.admin'));
      expect(admin).toMatchObject({ role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: true });
      expect((await tx.select({ n: sql<number>`count(*)::int` }).from(rolePermissions))[0]!.n).toBeGreaterThan(50);
    });
  });
});
