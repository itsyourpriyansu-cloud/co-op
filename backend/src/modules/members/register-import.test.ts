import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { importMemberRegister } from './register-import';

// P9 exit test (docs/22): import of a sample register succeeds.
describe('member register import (P9, F-11)', () => {
  let app: FastifyInstance;
  const sample = readFileSync(new URL('../../../import/members-register-sample.csv', import.meta.url), 'utf8');
  const opts = (commit: boolean) => ({ commit, asOn: '2026-10-24', actor: { id: 'system-import', name: 'Register import' } });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('checks every row and writes nothing when one is wrong', async () => {
    const bad = sample.replace('9000090002', '12345').replace(',50,2006', ',51,2006');
    const r = await importMemberRegister(app, bad, opts(true));
    expect(r.committed).toBe(false);
    expect(r.errors).toEqual([{ row: 3, generalNo: '9002', fieldErrors: expect.objectContaining({ mobile: expect.any(String), shareCapital: expect.stringMatching(/shares × share value/) }) }]);
    expect(await app.members.repo.find('mem-9001')).toBeFalsy();
    expect((await importMemberRegister(app, 'name\nX', opts(false))).errors[0]!.fieldErrors.header).toMatch(/Missing columns/);
  });

  it('a dry run passes, then the commit brings in members, shares and balanced opening entries', async () => {
    const dry = await importMemberRegister(app, sample, opts(false));
    expect(dry).toMatchObject({ rows: 2, committed: false, errors: [], shareCapital: 7_000_00, shareDeposit: 57_000_50 });
    const done = await importMemberRegister(app, sample, opts(true));
    expect(done.committed).toBe(true);

    const m = await app.members.repo.find('mem-9002');
    expect(m).toMatchObject({ generalNo: '9002', departmentId: expect.any(String), joinedSocietyOn: '2006-01-20', status: 'ACTIVE' });
    expect(m?.caste).toBeUndefined();
    expect(await app.collections.share('mem-9002')).toMatchObject({ numberOfShares: 50, shareCapital: 5_000_00, shareDepositBalance: 42_000_50 });
    const { rows } = await app.db.execute<{ d: string; c: string; n: string }>(sql`select sum(debit) d, sum(credit) c, count(distinct entry_id) n from journal_lines l join journal_entries e on e.id = l.entry_id where e.source = 'OPENING' and e.source_ref in ('mem-9001', 'mem-9002')`);
    expect(rows[0]).toMatchObject({ d: rows[0]!.c, n: '2' });
    expect(Number(rows[0]!.d)).toBe(7_000_00 + 57_000_50);

    // Running the same file again is refused row by row.
    const again = await importMemberRegister(app, sample, opts(true));
    expect(again.errors.map((e) => e.fieldErrors.generalNo)).toEqual(['General No. already used', 'General No. already used']);
  });
});
