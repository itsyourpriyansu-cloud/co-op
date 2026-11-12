import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { appAccounts, auditLog, membershipApplications } from '../../models';

// G7 (D-117, DPDP): a closed application is erased after the retention period; an open one never.
describe('applicant data retention (G7)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('erases a rejected application older than the setting, with the sign-in, and keeps an audit line', async () => {
    const [a, b] = await app.db.select().from(membershipApplications).limit(2);
    const old = new Date(Date.now() - 400 * 24 * 3600_000);
    await app.db.update(membershipApplications).set({ status: 'REJECTED', updatedAt: old }).where(eq(membershipApplications.id, a!.id));
    // Open applications are never erased, however old.
    await app.db.update(membershipApplications).set({ updatedAt: old }).where(eq(membershipApplications.id, b!.id));
    const keepStatus = b!.status === 'REJECTED' || b!.status === 'WITHDRAWN';

    expect(await app.joining.eraseClosedApplications()).toBe(keepStatus ? 2 : 1);
    expect(await app.db.select().from(membershipApplications).where(eq(membershipApplications.id, a!.id))).toEqual([]);
    expect(await app.db.select().from(appAccounts).where(eq(appAccounts.applicantId, a!.applicantId))).toEqual([]);
    if (!keepStatus) expect(await app.db.select().from(membershipApplications).where(eq(membershipApplications.id, b!.id))).toHaveLength(1);
    const [line] = await app.db.select().from(auditLog).where(and(eq(auditLog.entityId, a!.id), eq(auditLog.action, 'membership.erase')));
    expect(line?.summary).toMatch(new RegExp(`${a!.applicationNo} \\(rejected\\) erased after 12 months`));
    expect(await app.joining.eraseClosedApplications()).toBe(0);
  });
});
