import type { Session } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { makeSignaturePng } from '../../common/utils/png';

// G1 (D-111): real documents, checked by their bytes, encrypted, and shown only to who may see them.
describe('documents (G1)', () => {
  let app: FastifyInstance;
  let member: Session;
  let other: Session;
  let accountant: Session;
  let ddoFin: Session;
  let cashier: Session;
  const call = (method: 'GET' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });
  const png = makeSignaturePng(1).toString('base64');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

  beforeAll(async () => {
    app = await buildTestApp({ DOCUMENT_MAX_BYTES: '200000' });
    await reseed(app);
    // Mahesh is in GAD; the DDO persona is Finance.
    [member, other, accountant, cashier, ddoFin] = await Promise.all([signInAs(app, 'mem-1104'), signInAs(app, 'mem-1103'), signInAs(app, 'stf-accountant'), signInAs(app, 'stf-cashier'), signInAs(app, 'stf-ddo-fin')]);
  });
  afterAll(() => app.close());

  it('checks the file by its bytes and size', async () => {
    expect((await call('POST', '/me/documents', member, { type: 'NOPE', data: png })).json().fieldErrors).toHaveProperty('type');
    expect((await call('POST', '/me/documents', member, { type: 'PHOTO', data: Buffer.from('GIF89a......').toString('base64') })).json().fieldErrors).toHaveProperty('data');
    expect((await call('POST', '/me/documents', member, { type: 'PHOTO', data: Buffer.alloc(210_000, 0xff).toString('base64') })).json().message).toMatch(/larger than/);
  });

  it('stores a PDF and a photo; only the owner and allowed staff open them', async () => {
    const f = (await call('POST', '/me/documents', member, { type: 'ID_PROOF', fileName: '../../id card.exe', data: pdf })).json();
    expect(f).toMatchObject({ type: 'ID_PROOF', mime: 'application/pdf', fileName: 'id card.pdf', label: 'Government ID card' });
    expect((await call('GET', `/files/${f.fileId}`, member)).json().dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect((await call('GET', `/files/${f.fileId}`, accountant)).statusCode).toBe(200);
    expect((await call('GET', `/files/${f.fileId}`, other)).statusCode).toBe(404);
    expect((await call('GET', `/files/${f.fileId}`, ddoFin)).statusCode).toBe(404);
    expect((await call('GET', '/me/documents', member)).json()[0].fileId).toBe(f.fileId);
  });

  it('staff with members.edit add a document to a member record', async () => {
    expect((await call('POST', '/members/mem-1104/documents', cashier, { type: 'PHOTO', data: png })).statusCode).toBe(403);
    expect((await call('POST', '/members/mem-1104/documents', ddoFin, { type: 'PHOTO', data: png })).statusCode).toBeGreaterThanOrEqual(403);
    const f = (await call('POST', '/members/mem-1104/documents', accountant, { type: 'PHOTO', fileName: 'photo.png', data: png })).json();
    expect(f).toMatchObject({ mime: 'image/png', uploadedBy: 'Suresh Goud' });
    const profile = (await call('GET', '/members/mem-1104', accountant)).json();
    expect(profile.documents.map((d: { fileId: string }) => d.fileId)).toContain(f.fileId);
  });
});
