import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp } from '../../tests/helpers/test-app';
import { files } from '../models';
import { azureBlob, type BlobBackend } from './azure-blob';
import { databaseFileStore } from './file-store';

// G3 (D-113): the Blob backend against a fake HTTP server, and the file store using it.
describe('Azure Blob file store (G3)', () => {
  it('signs in with the App Service identity once, then puts and gets blobs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const stored = new Map<string, Buffer>();
    const fake = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.startsWith('http://identity')) return Response.json({ access_token: 'tok-1', expires_on: String(Math.floor(Date.now() / 1000) + 3600) });
      const name = url.split('/').pop()!;
      if (init?.method === 'PUT') {
        stored.set(name, Buffer.from(init.body as Uint8Array));
        return new Response(null, { status: 201 });
      }
      return stored.has(name) ? new Response(new Uint8Array(stored.get(name)!)) : new Response(null, { status: 404 });
    }) as typeof fetch;
    const blob = azureBlob({ account: 'tgsfiles', container: 'files', clientId: 'cid-1', env: { IDENTITY_ENDPOINT: 'http://identity/token', IDENTITY_HEADER: 'secret-h' }, fetchImpl: fake });

    await blob.put('fil-1', Buffer.from('sealed bytes'));
    expect((await blob.get('fil-1')).toString()).toBe('sealed bytes');
    await expect(blob.get('fil-missing')).rejects.toThrow(/404/);

    const tokenCalls = calls.filter((c) => c.url.startsWith('http://identity'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.url).toContain('resource=https%3A%2F%2Fstorage.azure.com%2F');
    expect(tokenCalls[0]!.url).toContain('client_id=cid-1');
    expect((tokenCalls[0]!.init!.headers as Record<string, string>)['X-IDENTITY-HEADER']).toBe('secret-h');
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    expect(put.url).toBe('https://tgsfiles.blob.core.windows.net/files/fil-1');
    expect(put.init!.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'x-ms-blob-type': 'BlockBlob', 'If-None-Match': '*' });
  });

  describe('file store with a blob backend', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildTestApp();
    });
    afterAll(() => app.close());

    it('keeps the encrypted bytes in the blob and only metadata in PostgreSQL', async () => {
      const blobs = new Map<string, Buffer>();
      const memory: BlobBackend = { put: async (n, b) => void blobs.set(n, b), get: async (n) => blobs.get(n)!, remove: async (n) => void blobs.delete(n) };
      const store = databaseFileStore(app.db, app.env.DATA_ENCRYPTION_KEY, memory);
      const plain = Buffer.from('%PDF-1.4 test document');
      const saved = await store.put({ ownerId: 'tst-blob-owner', purpose: 'DOCUMENT', mime: 'application/pdf', bytes: plain, width: 0, height: 0, docType: 'SUPPORTING', fileName: 'proof.pdf' });
      const [row] = await app.db.select({ sealed: files.sealed }).from(files).where(eq(files.id, saved.id));
      expect(row!.sealed.length).toBe(0);
      expect(blobs.get(saved.id)!.includes(plain)).toBe(false);
      expect((await store.read(saved.id))!.equals(plain)).toBe(true);
      // Files saved before the switch are still read from the row.
      const old = await databaseFileStore(app.db, app.env.DATA_ENCRYPTION_KEY).put({ ownerId: 'tst-blob-owner', purpose: 'DOCUMENT', mime: 'application/pdf', bytes: plain, width: 0, height: 0 });
      expect((await store.read(old.id))!.equals(plain)).toBe(true);
      // G7 (D-117): erasing an owner removes the rows and the blob.
      expect(await store.removeOwner('tst-blob-owner')).toBe(2);
      expect(blobs.size).toBe(0);
      expect(await app.db.select({ id: files.id }).from(files).where(inArray(files.id, [saved.id, old.id]))).toEqual([]);
    });
  });
});
