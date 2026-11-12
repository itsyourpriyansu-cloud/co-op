import type { DocumentUploadInput, FileContent, SessionUser, StoredDocument } from '@tgs/types';
import { REQUIRED_DOCUMENTS } from '@tgs/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { sessionOf } from '../../common/guards';
import type { FileStore, StoredFileMeta } from '../../integrations/file-store';

/** G1 (D-111): what a member or applicant may attach. Checked by the file's own first bytes, not its name. */
const KINDS: Array<{ mime: StoredDocument['mime']; ext: string; magic: number[] }> = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];
/** Joining documents plus proof attached to a profile change request. */
const TYPES = new Set<string>([...REQUIRED_DOCUMENTS.map((d) => d.type), 'SUPPORTING']);
const isStaff = (u: SessionUser) => u.role !== 'MEMBER' && u.role !== 'APPLICANT';

/** Image size from the header, for the record (0 × 0 for a PDF or a header we do not read). */
function dimensions(mime: string, b: Buffer): { width: number; height: number } {
  if (mime === 'image/png' && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (mime === 'image/jpeg') {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return { width: 0, height: 0 };
}

export const toDocument = (m: StoredFileMeta): StoredDocument => ({
  fileId: m.id,
  type: m.docType ?? 'OTHER',
  label: REQUIRED_DOCUMENTS.find((d) => d.type === m.docType)?.label ?? (m.docType === 'SUPPORTING' ? 'Supporting document' : 'Document'),
  fileName: m.fileName ?? m.id,
  mime: m.mime as StoredDocument['mime'],
  size: m.size,
  uploadedAt: m.createdAt,
  uploadedBy: m.uploadedBy ?? '',
});

/**
 * G1 (D-111): joining and member documents (photo, ID card, appointment order…), encrypted in the
 * same file store as signatures. A new upload is a new row; nothing is overwritten.
 */
export class DocumentsService {
  constructor(
    private readonly app: FastifyInstance,
    readonly store: FileStore,
  ) {}

  /** Validates and stores one file for `ownerId`. */
  private async put(request: FastifyRequest, ownerId: string, body: DocumentUploadInput): Promise<StoredDocument> {
    const user = sessionOf(request);
    if (!TYPES.has(body.type)) fail('VALIDATION_ERROR', 'Choose which document this is.', { fieldErrors: { type: 'Choose a document type' } });
    const raw = (body.data ?? '').replace(/^data:[^,]*,/, '');
    if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) fail('VALIDATION_ERROR', 'Choose a file.', { fieldErrors: { data: 'Choose a file' } });
    const bytes = Buffer.from(raw, 'base64');
    const max = this.app.env.DOCUMENT_MAX_BYTES;
    if (bytes.length > max) fail('VALIDATION_ERROR', `The file is larger than ${Math.round(max / 1024 / 1024)} MB.`, { fieldErrors: { data: 'File too large' } });
    const kind = KINDS.find((k) => k.magic.every((v, i) => bytes[i] === v));
    if (!kind) fail('VALIDATION_ERROR', 'Use a JPEG or PNG photo, or a PDF.', { fieldErrors: { data: 'Use JPEG, PNG or PDF' } });
    const base = (body.fileName ?? '').split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, '').replace(/^\.+/, '').trim().slice(0, 80).replace(/\.[^.]*$/, '') || body.type.toLowerCase();
    const meta = await this.store.put({ ownerId, purpose: 'DOCUMENT', mime: kind!.mime, bytes, ...dimensions(kind!.mime, bytes), docType: body.type, fileName: `${base}.${kind!.ext}`, uploadedBy: user.name });
    await this.app.audit.record(request, { action: 'document.upload', entity: 'file', entityId: meta.id, summary: `${user.name} uploaded ${toDocument(meta).label} (${Math.ceil(meta.size / 1024)} KB) for ${ownerId}` });
    return toDocument(meta);
  }

  /** An applicant or member attaches their own document. */
  uploadMine(request: FastifyRequest, body: DocumentUploadInput): Promise<StoredDocument> {
    return this.put(request, sessionOf(request).id, body);
  }

  /** Staff with members.edit attach a document to a member's record (DDOs only in their department). */
  async uploadFor(request: FastifyRequest, memberId: string, body: DocumentUploadInput): Promise<StoredDocument> {
    const m = (await this.app.members.repo.find(memberId)) ?? fail('NOT_FOUND', 'Member not found.');
    const user = sessionOf(request);
    if (user.role === 'DDO' && m.departmentId !== user.departmentId) fail('NOT_FOUND', 'Member not found.');
    return this.put(request, m.id, body);
  }

  list(ownerId: string): Promise<StoredDocument[]> {
    return this.store.list(ownerId, 'DOCUMENT').then((rows) => rows.map(toDocument));
  }

  /** The file itself: its owner, or staff who may see members or applications (DDOs: own department). */
  async content(request: FastifyRequest, fileId: string): Promise<FileContent> {
    const user = sessionOf(request);
    const meta = await this.store.meta(fileId);
    if (!meta || (meta.ownerId !== user.id && !(await this.staffMaySee(user, meta.ownerId)))) return fail('NOT_FOUND', 'File not found.');
    if (meta.ownerId !== user.id) await this.app.audit.record(request, { action: 'file.view', entity: 'file', entityId: meta.id, summary: `${user.name} opened ${meta.fileName ?? meta.id} of ${meta.ownerId}` });
    const bytes = (await this.store.read(meta.id))!;
    return { fileId: meta.id, mime: meta.mime, fileName: meta.fileName ?? meta.id, dataUrl: `data:${meta.mime};base64,${bytes.toString('base64')}` };
  }

  private async staffMaySee(user: SessionUser, ownerId: string): Promise<boolean> {
    if (!isStaff(user)) return false;
    const [members, joining] = await Promise.all([this.app.permissions.has(user.role, 'members.view'), this.app.permissions.has(user.role, 'membership.view')]);
    if (!members && !joining) return false;
    if (user.role !== 'DDO') return true;
    const m = await this.app.members.repo.find(ownerId);
    if (m) return m.departmentId === user.departmentId;
    const a = await this.app.joining.repo.byApplicant(ownerId);
    return a?.departmentId === user.departmentId;
  }

  /** Throws unless `fileId` is a document this user uploaded (a draft may only point at its own files). */
  async assertOwn(userId: string, fileId: string): Promise<void> {
    const meta = await this.store.meta(fileId);
    if (!meta || meta.ownerId !== userId || meta.docType === null) fail('VALIDATION_ERROR', 'Upload the file again.', { fieldErrors: { documents: 'Upload the file again' } });
  }
}
