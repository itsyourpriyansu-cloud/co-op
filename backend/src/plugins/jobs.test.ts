import { addDays } from '@tgs/domain';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../tests/helpers/auth';
import { buildTestApp } from '../../tests/helpers/test-app';
import { deposits, notifications } from '../models';
import { claimDay, runHousekeeping } from './jobs';

// G3 (D-113): the daily housekeeping job: FD maturity reminders once, expired records removed.
describe('daily housekeeping (G3)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('only one server claims a day', async () => {
    expect(await claimDay(app, 'test.claim', '2026-11-12')).toBe(true);
    expect(await claimDay(app, 'test.claim', '2026-11-12')).toBe(false);
    expect(await claimDay(app, 'test.claim', '2026-11-13')).toBe(true);
  });

  it('reminds each member once, a month before the FD matures', async () => {
    const [fd] = await app.db.select().from(deposits).where(and(eq(deposits.scheme, 'FD'), eq(deposits.status, 'ACTIVE'), isNotNull(deposits.maturityDate))).orderBy(asc(deposits.maturityDate)).limit(1);
    expect(fd).toBeDefined();
    const today = addDays(fd!.maturityDate!, -10);
    const first = await runHousekeeping(app, today);
    expect(first.reminders).toBeGreaterThan(0);
    const sent = await app.db.select().from(notifications).where(and(eq(notifications.recipientId, fd!.memberId), eq(notifications.templateKey, 'fd.maturing')));
    expect(sent.some((n) => n.link === `/deposit/${fd!.id}`)).toBe(true);
    expect((await runHousekeeping(app, today)).reminders).toBe(0);
  });
});
