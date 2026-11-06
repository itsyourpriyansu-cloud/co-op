import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest: how refresh tokens and OTP codes are stored (never in plain text). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Unguessable opaque token (refresh tokens, challenge ids). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** A 6-digit numeric code. */
export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const keyFrom = (secret: string) => createHash('sha256').update(secret).digest();

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext). */
export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(sealed: string, secret: string): string {
  const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
