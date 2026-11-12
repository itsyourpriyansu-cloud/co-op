// G8 (D-118): re-encrypt everything sealed with DATA_ENCRYPTION_KEY under a new key (authenticator
// secrets, stored files in PostgreSQL and in Blob Storage). Run with the app stopped (runbook §6):
//   DATA_ENCRYPTION_KEY=<old> NEW_DATA_ENCRYPTION_KEY=<new> npm run db:rotate-key
// Safe to run again after a failure: anything that already opens with the new key is skipped.
import { eq, isNotNull } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { decrypt, encrypt, openBytes, sealBytes } from '../common/utils/crypto';
import { loadEnv } from '../config/env';
import { azureBlob, type BlobBackend } from '../integrations/azure-blob';
import { files, staffUsers } from '../models';
import { createDb, type Database } from './client';

const opens = (f: () => unknown) => {
  try {
    f();
    return true;
  } catch {
    return false;
  }
};

export async function rotateDataKey(db: Database, oldKey: string, newKey: string, blob?: BlobBackend) {
  if (newKey.length < 32 || newKey === oldKey) throw new Error('NEW_DATA_ENCRYPTION_KEY must be at least 32 characters and differ from the old key.');
  const done = { secrets: 0, rows: 0, blobs: 0, skipped: 0 };
  for (const s of await db.select({ id: staffUsers.id, secret: staffUsers.totpSecret }).from(staffUsers).where(isNotNull(staffUsers.totpSecret))) {
    if (opens(() => decrypt(s.secret!, newKey))) done.skipped++;
    else {
      await db.update(staffUsers).set({ totpSecret: encrypt(decrypt(s.secret!, oldKey), newKey) }).where(eq(staffUsers.id, s.id));
      done.secrets++;
    }
  }
  for (const { id } of await db.select({ id: files.id }).from(files)) {
    const [row] = await db.select({ sealed: files.sealed }).from(files).where(eq(files.id, id));
    if (row!.sealed.length) {
      if (opens(() => openBytes(row!.sealed, newKey))) done.skipped++;
      else {
        await db.update(files).set({ sealed: sealBytes(openBytes(row!.sealed, oldKey), newKey) }).where(eq(files.id, id));
        done.rows++;
      }
    } else {
      if (!blob) throw new Error(`File ${id} is in Blob Storage; run with FILE_STORE=azure-blob.`);
      const sealed = await blob.get(id);
      if (opens(() => openBytes(sealed, newKey))) done.skipped++;
      else {
        await blob.put(id, sealBytes(openBytes(sealed, oldKey), newKey), { overwrite: true });
        done.blobs++;
      }
    }
  }
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = loadEnv();
  const handle = createDb({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL });
  const blob = env.FILE_STORE === 'azure-blob' ? azureBlob({ account: env.AZURE_STORAGE_ACCOUNT, container: env.AZURE_STORAGE_CONTAINER, clientId: env.AZURE_CLIENT_ID }) : undefined;
  try {
    const r = await rotateDataKey(handle.db, env.DATA_ENCRYPTION_KEY, process.env.NEW_DATA_ENCRYPTION_KEY ?? '', blob);
    console.log(`Re-encrypted ${r.secrets} authenticator secrets, ${r.rows} files in the database, ${r.blobs} files in Blob Storage (${r.skipped} already on the new key).`);
    console.log('Now put the new key in Key Vault as DATA-ENCRYPTION-KEY and start the app (runbook §6).');
  } finally {
    await handle.close();
  }
}
