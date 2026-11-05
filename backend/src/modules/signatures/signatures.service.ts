import type { MySignature, SessionUser, SignatureImage } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import { checkPng } from '../../common/utils/png';
import type { FileStore, StoredFileMeta } from '../../integrations/file-store';
import type { Tx } from '../../db/transaction';

/** F-01 (D-096): a clean signature is a few KB; 200 KB leaves room for a phone photo cropped to the signature. */
export const SIGNATURE_LIMITS = { maxBytes: 200 * 1024, maxWidth: 2000, maxHeight: 1000 };

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
const isStaff = (u: SessionUser) => u.role !== 'MEMBER' && u.role !== 'APPLICANT';

/**
 * F-01 (D-096): every user keeps a PNG signature, encrypted in the file store. It must be on file
 * before an OTP signature or a staff sign-off, and the signed record keeps the file id it used.
 */
export class SignaturesService {
  constructor(
    private readonly app: FastifyInstance,
    readonly store: FileStore,
  ) {}

  private async describe(meta: StoredFileMeta): Promise<MySignature> {
    const png = (await this.store.read(meta.id))!;
    return { fileId: meta.id, uploadedAt: meta.createdAt, width: meta.width, height: meta.height, sha256: meta.sha256, dataUrl: dataUrl(png) };
  }

  async mine(user: SessionUser): Promise<MySignature | null> {
    const meta = await this.store.latest(user.id, 'SIGNATURE');
    return meta ? this.describe(meta) : null;
  }

  async upload(request: FastifyRequest, body: { png?: string }): Promise<MySignature> {
    const user = sessionOf(request);
    const raw = (body?.png ?? '').replace(/^data:image\/png;base64,/, '');
    if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) fail('VALIDATION_ERROR', 'Choose a PNG image of your signature.', { fieldErrors: { png: 'Choose a PNG image' } });
    const check = checkPng(Buffer.from(raw, 'base64'), SIGNATURE_LIMITS);
    if (!check.ok) return fail('VALIDATION_ERROR', check.reason, { fieldErrors: { png: check.reason } });
    const meta = await this.store.put({ ownerId: user.id, purpose: 'SIGNATURE', mime: 'image/png', bytes: check.png, width: check.width, height: check.height });
    await this.app.audit.record(request, { action: 'signature.upload', entity: 'file', entityId: meta.id, summary: `${user.name} uploaded a signature (${check.width} × ${check.height}, ${Math.ceil(meta.size / 1024)} KB)` });
    return this.describe(meta);
  }

  /** Staff see any signature (to print what was signed); others only their own. Viewing someone else's is audited. */
  async image(request: FastifyRequest, fileId: string): Promise<SignatureImage> {
    const user = sessionOf(request);
    const meta = (await this.store.meta(fileId)) ?? fail('NOT_FOUND', 'Signature not found.');
    if (meta.ownerId !== user.id && !isStaff(user)) fail('NOT_FOUND', 'Signature not found.');
    if (meta.ownerId !== user.id) await this.app.audit.record(request, { action: 'signature.view', entity: 'file', entityId: meta.id, summary: `${user.name} viewed the signature of ${meta.ownerId}` });
    return { fileId: meta.id, dataUrl: dataUrl((await this.store.read(meta.id))!) };
  }

  /** The signature to put on what this person signs now; none on file blocks the signature. */
  async require(ownerId: string, who: 'you' | 'staff' = 'you'): Promise<string> {
    const meta = await this.store.latest(ownerId, 'SIGNATURE');
    if (!meta) fail('RULE_VIOLATION', who === 'you' ? 'Upload your signature first: Profile → My signature.' : 'Upload your signature first: account menu → My signature.', { ruleId: 'SIGNATURE_REQUIRED' });
    return meta!.id;
  }

  /**
   * A staff sign-off: the officer's signature, required when they act themselves. A demo control
   * acting for an absent officer uses theirs if on file and never blocks.
   */
  async signOff(actorId: string, demo = false): Promise<string | undefined> {
    return demo ? (await this.store.latest(actorId, 'SIGNATURE'))?.id : this.require(actorId, 'staff');
  }

  reassign(fromOwnerId: string, toOwnerId: string, tx?: Tx): Promise<void> {
    return this.store.reassign(fromOwnerId, toOwnerId, tx);
  }
}
