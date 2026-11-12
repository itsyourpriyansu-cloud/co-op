import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import type { Tx } from '../db/transaction';
import { files } from '../models';
import { openBytes, sealBytes } from '../common/utils/crypto';
import type { BlobBackend } from './azure-blob';

export interface StoredFileMeta {
  id: string;
  ownerId: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  sha256: string;
  createdAt: string;
  docType?: string | null;
  fileName?: string | null;
  uploadedBy?: string | null;
}

export type FilePurpose = 'SIGNATURE' | 'DOCUMENT';

/**
 * Where files live (D-074, D-096). The modules use only this interface; today the files are
 * encrypted inside PostgreSQL, later they can move to Azure Blob Storage without changing them.
 */
export interface FileStore {
  put(input: { ownerId: string; purpose: FilePurpose; mime: string; bytes: Buffer; width: number; height: number; docType?: string; fileName?: string; uploadedBy?: string }, tx?: Tx): Promise<StoredFileMeta>;
  latest(ownerId: string, purpose: FilePurpose): Promise<StoredFileMeta | undefined>;
  /** Newest first. */
  list(ownerId: string, purpose: FilePurpose): Promise<StoredFileMeta[]>;
  meta(id: string): Promise<StoredFileMeta | undefined>;
  read(id: string): Promise<Buffer | undefined>;
  /** An applicant who is admitted keeps their files under the new member id. */
  reassign(fromOwnerId: string, toOwnerId: string, tx?: Tx): Promise<void>;
  /** G7 (D-117, DPDP): erases every file of an owner, row and blob. Returns how many. */
  removeOwner(ownerId: string, tx?: Tx): Promise<number>;
}

const metaColumns = { id: files.id, ownerId: files.ownerId, mime: files.mime, size: files.size, width: files.width, height: files.height, sha256: files.sha256, createdAt: files.createdAt, docType: files.docType, fileName: files.fileName, uploadedBy: files.uploadedBy };

/**
 * Metadata always lives in `files`. With a `blob` backend (FILE_STORE=azure-blob, G3 D-113) the
 * encrypted bytes go to Blob Storage and `sealed` stays empty; files saved before the switch keep
 * their bytes in the row and are still read from there.
 */
export function databaseFileStore(db: Database, secret: string, blob?: BlobBackend): FileStore {
  return {
    async put(input, tx) {
      const id = `fil-${randomUUID()}`;
      const sealed = sealBytes(input.bytes, secret);
      // shortcut: uploaded before the row commits, so a rolled-back transaction leaves an unused blob; add a sweep if that ever matters.
      if (blob) await blob.put(id, sealed);
      const row = { id, ownerId: input.ownerId, purpose: input.purpose, mime: input.mime, size: input.bytes.length, width: input.width, height: input.height, docType: input.docType ?? null, fileName: input.fileName ?? null, uploadedBy: input.uploadedBy ?? null, sha256: createHash('sha256').update(input.bytes).digest('hex'), sealed: blob ? Buffer.alloc(0) : sealed };
      const [saved] = await (tx ?? db).insert(files).values(row).returning(metaColumns);
      return saved!;
    },
    async latest(ownerId, purpose) {
      return (await db.select(metaColumns).from(files).where(and(eq(files.ownerId, ownerId), eq(files.purpose, purpose))).orderBy(desc(files.createdAt)).limit(1))[0];
    },
    async list(ownerId, purpose) {
      return db.select(metaColumns).from(files).where(and(eq(files.ownerId, ownerId), eq(files.purpose, purpose))).orderBy(desc(files.createdAt));
    },
    async meta(id) {
      return (await db.select(metaColumns).from(files).where(eq(files.id, id)))[0];
    },
    async read(id) {
      const [row] = await db.select({ sealed: files.sealed }).from(files).where(eq(files.id, id));
      if (!row) return undefined;
      if (row.sealed.length) return openBytes(row.sealed, secret);
      if (!blob) throw new Error(`File ${id} is in Blob Storage but FILE_STORE is not azure-blob.`);
      return openBytes(await blob.get(id), secret);
    },
    async reassign(fromOwnerId, toOwnerId, tx) {
      await (tx ?? db).update(files).set({ ownerId: toOwnerId }).where(eq(files.ownerId, fromOwnerId));
    },
    async removeOwner(ownerId, tx) {
      const gone = await (tx ?? db).delete(files).where(eq(files.ownerId, ownerId)).returning({ id: files.id, sealed: files.sealed });
      // shortcut: the blob goes before the row's transaction commits; a rollback then leaves a row without bytes, which reads as an error and is erased on the next run.
      if (blob) for (const f of gone) if (!f.sealed.length) await blob.remove(f.id);
      return gone.length;
    },
  };
}
