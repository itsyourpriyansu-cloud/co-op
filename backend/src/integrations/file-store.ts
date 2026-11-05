import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import type { Tx } from '../db/transaction';
import { files } from '../models';
import { openBytes, sealBytes } from '../common/utils/crypto';

export interface StoredFileMeta {
  id: string;
  ownerId: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
}

/**
 * Where files live (D-074, D-096). The modules use only this interface; today the files are
 * encrypted inside PostgreSQL, later they can move to Azure Blob Storage without changing them.
 */
export interface FileStore {
  put(input: { ownerId: string; purpose: 'SIGNATURE'; mime: string; bytes: Buffer; width: number; height: number }, tx?: Tx): Promise<StoredFileMeta>;
  latest(ownerId: string, purpose: 'SIGNATURE'): Promise<StoredFileMeta | undefined>;
  meta(id: string): Promise<StoredFileMeta | undefined>;
  read(id: string): Promise<Buffer | undefined>;
  /** An applicant who is admitted keeps their files under the new member id. */
  reassign(fromOwnerId: string, toOwnerId: string, tx?: Tx): Promise<void>;
}

const metaColumns = { id: files.id, ownerId: files.ownerId, mime: files.mime, size: files.size, width: files.width, height: files.height, sha256: files.sha256, createdAt: files.createdAt };

export function databaseFileStore(db: Database, secret: string): FileStore {
  return {
    async put(input, tx) {
      const row = { id: `fil-${randomUUID()}`, ownerId: input.ownerId, purpose: input.purpose, mime: input.mime, size: input.bytes.length, width: input.width, height: input.height, sha256: createHash('sha256').update(input.bytes).digest('hex'), sealed: sealBytes(input.bytes, secret) };
      const [saved] = await (tx ?? db).insert(files).values(row).returning(metaColumns);
      return saved!;
    },
    async latest(ownerId, purpose) {
      return (await db.select(metaColumns).from(files).where(and(eq(files.ownerId, ownerId), eq(files.purpose, purpose))).orderBy(desc(files.createdAt)).limit(1))[0];
    },
    async meta(id) {
      return (await db.select(metaColumns).from(files).where(eq(files.id, id)))[0];
    },
    async read(id) {
      const [row] = await db.select({ sealed: files.sealed }).from(files).where(eq(files.id, id));
      return row ? openBytes(row.sealed, secret) : undefined;
    },
    async reassign(fromOwnerId, toOwnerId, tx) {
      await (tx ?? db).update(files).set({ ownerId: toOwnerId }).where(eq(files.ownerId, fromOwnerId));
    },
  };
}
