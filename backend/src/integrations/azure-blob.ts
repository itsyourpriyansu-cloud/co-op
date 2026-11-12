import { managedIdentityToken } from './azure-identity';

/**
 * G3 (D-113): Azure Blob Storage for the file store, signed in with the App Service's managed
 * identity: no storage key or connection string exists anywhere. Files reach it already encrypted
 * by the app (AES-256-GCM, integrations/file-store), so the storage account never sees a plain file.
 * Plain `fetch` against the Blob REST API; no Azure SDK is added for two calls.
 */
export interface BlobBackend {
  /** Refuses to replace a file unless `overwrite` (only the key rotation re-writes files, G8). */
  put(name: string, bytes: Buffer, opts?: { overwrite?: boolean }): Promise<void>;
  get(name: string): Promise<Buffer>;
  /** G7 (D-117): erase a file (DPDP); a missing one counts as erased. */
  remove(name: string): Promise<void>;
}

export interface AzureBlobOptions {
  account: string;
  container: string;
  /** A user-assigned identity's client id; empty for the system-assigned one. */
  clientId?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

const RESOURCE = 'https://storage.azure.com/';
const API_VERSION = '2023-11-03';

export function azureBlob({ account, container, clientId, env = process.env, fetchImpl = fetch }: AzureBlobOptions): BlobBackend {
  const token = managedIdentityToken(RESOURCE, { clientId, env, fetchImpl });

  const url = (name: string) => `https://${account}.blob.core.windows.net/${container}/${encodeURIComponent(name)}`;
  const headers = async (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${await token()}`, 'x-ms-version': API_VERSION, ...extra });

  return {
    async put(name, bytes, opts) {
      // Files are never replaced (a new upload is a new id), so refuse to overwrite one.
      const res = await fetchImpl(url(name), { method: 'PUT', headers: await headers({ 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/octet-stream', ...(opts?.overwrite ? {} : { 'If-None-Match': '*' }) }), body: new Uint8Array(bytes) });
      if (res.status !== 201) throw new Error(`Blob upload failed (${res.status}).`);
    },
    async get(name) {
      const res = await fetchImpl(url(name), { headers: await headers() });
      if (!res.ok) throw new Error(`Blob read failed (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(name) {
      const res = await fetchImpl(url(name), { method: 'DELETE', headers: await headers({ 'x-ms-delete-snapshots': 'include' }) });
      if (res.status !== 202 && res.status !== 404) throw new Error(`Blob delete failed (${res.status}).`);
    },
  };
}
