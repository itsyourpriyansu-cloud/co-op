import type { LoanDetail, MySignature, Session, SignatureImage } from '@tgs/types';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, reseed, signInAs } from '../../../tests/helpers/auth';
import { buildTestApp } from '../../../tests/helpers/test-app';
import { checkPng, makeSignaturePng } from '../../common/utils/png';
import { demoDataset } from '../../db/seed/dataset';
import { files } from '../../models';

const LIMITS = { maxBytes: 200 * 1024, maxWidth: 2000, maxHeight: 1000 };

describe('PNG check (F-01)', () => {
  it('accepts a real PNG and drops its metadata; rejects anything else', () => {
    const png = makeSignaturePng(3);
    expect(png.includes(Buffer.from('demo signature'))).toBe(true);
    const ok = checkPng(png, LIMITS);
    expect(ok).toMatchObject({ ok: true, width: 240, height: 80 });
    if (ok.ok) expect(ok.png.includes(Buffer.from('demo signature'))).toBe(false);
    expect(checkPng(Buffer.from('GIF89a not a png at all, really not', 'latin1'), LIMITS)).toMatchObject({ ok: false });
    expect(checkPng(png, { ...LIMITS, maxBytes: 100 })).toMatchObject({ ok: false });
    expect(checkPng(png, { ...LIMITS, maxWidth: 100 })).toMatchObject({ ok: false });
    const broken = Buffer.from(png);
    broken[40] = broken[40]! ^ 0xff;
    expect(checkPng(broken, LIMITS)).toMatchObject({ ok: false, reason: 'The PNG file is damaged.' });
  });
});

// F-01 (D-096): signatures on file, encrypted, required before signing, kept on what was signed.
describe('signatures (F-01)', () => {
  let app: FastifyInstance;
  let member: Session;
  let other: Session;
  let cashier: Session;
  const data = demoDataset();
  const call = (method: 'GET' | 'PUT' | 'POST', url: string, s: Session, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: bearer(s), ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await buildTestApp();
    await reseed(app);
    [member, other, cashier] = await Promise.all([signInAs(app, 'mem-1103'), signInAs(app, 'mem-1101'), signInAs(app, 'stf-cashier')]);
  });
  afterAll(() => app.close());

  it('demo users have one on file; an upload replaces it, encrypted at rest', async () => {
    const before = (await call('GET', '/me/signature', member)).json() as MySignature;
    expect(before.dataUrl).toMatch(/^data:image\/png;base64,/);
    const res = await call('PUT', '/me/signature', member, { png: makeSignaturePng(9).toString('base64') });
    expect(res.statusCode).toBe(200);
    const after = res.json() as MySignature;
    expect(after.fileId).not.toBe(before.fileId);
    expect((await call('GET', '/me/signature', member)).json().fileId).toBe(after.fileId);
    const [row] = await app.db.select({ sealed: files.sealed }).from(files).where(eq(files.id, after.fileId));
    expect(row!.sealed.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect((await call('PUT', '/me/signature', member, { png: Buffer.from('not a png').toString('base64') })).statusCode).toBe(400);
  });

  it('staff may see a signature (audited); another member may not', async () => {
    const mine = (await call('GET', '/me/signature', member)).json() as MySignature;
    expect((await call('GET', `/signatures/${mine.fileId}`, other)).statusCode).toBe(404);
    expect(((await call('GET', `/signatures/${mine.fileId}`, cashier)).json() as SignatureImage).dataUrl).toBe(mine.dataUrl);
    const audit = await app.db.execute(sql`select count(*)::int as n from audit_log where action = 'signature.view' and entity_id = ${mine.fileId}`);
    expect((audit.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('without a signature on file, signing is refused until one is uploaded', async () => {
    await app.db.delete(files).where(eq(files.ownerId, 'mem-1103'));
    const loan = data.loans.find((l) => l.status === 'SURETY_PENDING' && l.sureties.some((s) => s.memberId === 'mem-1103' && s.status === 'PENDING'));
    if (!loan) return;
    const refused = await call('POST', `/me/surety-requests/${loan.id}/sign/request`, member);
    expect(refused.json()).toMatchObject({ code: 'RULE_VIOLATION', ruleId: 'SIGNATURE_REQUIRED' });
    const uploaded = (await call('PUT', '/me/signature', member, { png: makeSignaturePng(4).toString('base64') })).json() as MySignature;
    const otp = (await call('POST', `/me/surety-requests/${loan.id}/sign/request`, member)).json();
    expect(otp.otpRef).toBeTruthy();
    await call('POST', `/me/surety-requests/${loan.id}/accept`, member, { otpRef: otp.otpRef, otp: otp.demoOtp });
    const staff = await signInAs(app, 'stf-accountant');
    const detail = (await call('GET', `/loans/${loan.id}`, staff)).json() as LoanDetail;
    expect(detail.loan.sureties.find((s) => s.memberId === 'mem-1103')).toMatchObject({ status: 'ACCEPTED', signatureFileId: uploaded.fileId });
  });

  it('an officer with no signature on file cannot sign off; after uploading, the sign-off carries it', async () => {
    const secretary = await signInAs(app, 'stf-secretary');
    await app.db.delete(files).where(eq(files.ownerId, 'stf-secretary'));
    const membership = data.membershipApplications.find((a) => a.status === 'APPROVAL_SECRETARY')!;
    const fd = data.deposits.find((d) => d.status === 'ACCEPTANCE_SECRETARY');
    const refused = await call('POST', `/membership/applications/${membership.id}/actions/approve`, secretary, {});
    expect(refused.json()).toMatchObject({ code: 'RULE_VIOLATION', ruleId: 'SIGNATURE_REQUIRED' });
    const sig = (await call('PUT', '/me/signature', secretary, { png: makeSignaturePng(2).toString('base64') })).json() as MySignature;
    const approved = (await call('POST', `/membership/applications/${membership.id}/actions/approve`, secretary, {})).json();
    expect(approved.application.secretaryApproval).toMatchObject({ signatureFileId: sig.fileId });
    if (fd) {
      const accepted = (await call('POST', `/deposits/${fd.id}/actions/accept`, secretary, {})).json();
      expect(accepted.deposit.signOffs.secretary).toMatchObject({ signatureFileId: sig.fileId });
    }
  });
});
