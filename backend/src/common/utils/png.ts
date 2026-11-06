import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Chunks an image needs; everything else (text, EXIF, time, colour profiles) is metadata and is dropped. */
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

export type PngCheck = { ok: true; png: Buffer; width: number; height: number } | { ok: false; reason: string };

/**
 * F-01 (D-096): accepts only a real PNG (by its bytes, not its name) within the size limits and
 * returns it with the metadata chunks removed. Every chunk keeps its own CRC, so nothing is re-encoded.
 */
export function checkPng(bytes: Buffer, limits: { maxBytes: number; maxWidth: number; maxHeight: number }): PngCheck {
  if (bytes.length > limits.maxBytes) return { ok: false, reason: `The file is larger than ${Math.round(limits.maxBytes / 1024)} KB.` };
  if (bytes.length < 8 + 25 || !bytes.subarray(0, 8).equals(SIGNATURE)) return { ok: false, reason: 'The file is not a PNG image.' };
  const kept: Buffer[] = [SIGNATURE];
  let width = 0;
  let height = 0;
  let off = 8;
  let ended = false;
  while (off + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString('latin1', off + 4, off + 8);
    const end = off + 12 + len;
    if (end > bytes.length) return { ok: false, reason: 'The PNG file is damaged.' };
    if (crc32(bytes.subarray(off + 4, off + 8 + len)) !== bytes.readUInt32BE(off + 8 + len)) return { ok: false, reason: 'The PNG file is damaged.' };
    if (off === 8) {
      if (type !== 'IHDR') return { ok: false, reason: 'The PNG file is damaged.' };
      width = bytes.readUInt32BE(off + 8);
      height = bytes.readUInt32BE(off + 12);
    }
    if (KEEP.has(type)) kept.push(bytes.subarray(off, end));
    off = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended) return { ok: false, reason: 'The PNG file is damaged.' };
  if (!width || !height || width > limits.maxWidth || height > limits.maxHeight) return { ok: false, reason: `The image must be at most ${limits.maxWidth} × ${limits.maxHeight} pixels.` };
  return { ok: true, png: Buffer.concat(kept), width, height };
}

/** A small PNG for tests and the demo seed: a dark pen stroke on transparency (RGBA). */
export function makeSignaturePng(seed = 1, width = 240, height = 80): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) {
      const curve = height / 2 + Math.sin((x + seed * 17) / (9 + (seed % 5))) * (height / 4) * Math.cos(x / 53);
      if (Math.abs(y - curve) < 1.6 && x > 12 && x < width - 12) row.set([20, 32, 70, 255], 1 + x * 4);
    }
    rows.push(row);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0demo signature')), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
