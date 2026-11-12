import { isNotNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reseed } from '../../tests/helpers/auth';
import { buildTestApp } from '../../tests/helpers/test-app';
import { decrypt, encrypt } from '../common/utils/crypto';
import { databaseFileStore } from '../integrations/file-store';
import { files, staffUsers } from '../models';
import { rotateDataKey } from './rotate-key';

// G8 (D-118): the data key can be changed without losing a signature, document or authenticator.
describe('data key rotation (G8)', () => {
  let app: FastifyInstance;
  const NEW = 'a-new-data-encryption-key-for-the-rotation-test-0001';
  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
  });
  afterAll(() => app.close());

  it('re-encrypts secrets, rows and blobs; a second run skips; rotating back restores the original', async () => {
    const OLD = app.env.DATA_ENCRYPTION_KEY;
    const blobs = new Map<string, Buffer>();
    const memory = { put: async (n: string, b: Buffer) => void blobs.set(n, b), get: async (n: string) => blobs.get(n)!, remove: async (n: string) => void blobs.delete(n) };
    const inBlob = await databaseFileStore(app.db, OLD, memory).put({ ownerId: 'tst-rotate', purpose: 'DOCUMENT', mime: 'application/pdf', bytes: Buffer.from('%PDF blob'), width: 0, height: 0 });
    const [someRow] = await app.db.select({ id: files.id }).from(files).where(sql`length(${files.sealed}) > 0`).limit(1);
    const before = await databaseFileStore(app.db, OLD, memory).read(someRow!.id);
    await app.db.update(staffUsers).set({ totpSecret: encrypt('JBSWY3DPEHPK3PXP', OLD) }).where(isNotNull(staffUsers.id));

    const r = await rotateDataKey(app.db, OLD, NEW, memory);
    expect(r).toMatchObject({ blobs: 1, skipped: 0 });
    expect(r.rows).toBeGreaterThan(0);
    expect(r.secrets).toBeGreaterThan(0);
    const fresh = databaseFileStore(app.db, NEW, memory);
    expect((await fresh.read(inBlob.id))!.toString()).toBe('%PDF blob');
    expect((await fresh.read(someRow!.id))!.equals(before!)).toBe(true);
    const [s] = await app.db.select({ t: staffUsers.totpSecret }).from(staffUsers).limit(1);
    expect(decrypt(s!.t!, NEW)).toBe('JBSWY3DPEHPK3PXP');

    expect(await rotateDataKey(app.db, OLD, NEW, memory)).toMatchObject({ secrets: 0, rows: 0, blobs: 0 });
    await expect(rotateDataKey(app.db, OLD, OLD, memory)).rejects.toThrow(/differ/);

    // Back to the test key so the other test files can read their files.
    await rotateDataKey(app.db, NEW, OLD, memory);
    expect((await databaseFileStore(app.db, OLD, memory).read(someRow!.id))!.equals(before!)).toBe(true);
    await databaseFileStore(app.db, OLD, memory).removeOwner('tst-rotate');
    await reseed(app);
  });
});
