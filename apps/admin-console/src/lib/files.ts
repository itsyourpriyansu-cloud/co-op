import { api } from './api';

// Same rules as the phone app (apps/member-app/src/lib/files.ts, D-122): a photo is shrunk to a
// 1600 px long edge and JPEG 70% (down to 40% only if over 500 KB); a PDF is sent as it is (2 MB).
const MAX_EDGE = 1600;
const QUALITY_STEPS = [0.7, 0.55, 0.4];
const TARGET_BYTES = 500 * 1024;
const MAX_PICK_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const SIGNATURE_MAX_BYTES = 200 * 1024;
const SIGNATURE_WIDTHS = [800, 600, 450, 320];

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });

/** Draws the image at `scale` and encodes it. */
async function encode(bitmap: ImageBitmap, scale: number, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('Could not process the image.'))), type, quality));
}

async function openBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('This picture could not be read. Use a JPG or PNG.');
  }
}

/** A document: JPEG or PNG is shrunk, a PDF is checked and kept. Returns base64 and the stored file name. */
export async function prepareDocument(file: File): Promise<{ data: string; fileName: string }> {
  if (file.size > MAX_PICK_BYTES) throw new Error('The file is too large. Choose a file under 25 MB.');
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('The PDF is larger than 2 MB. Make a smaller PDF or photograph the pages.');
    return { data: await toBase64(file), fileName: file.name };
  }
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new Error('Use a JPG, PNG or PDF file.');
  const bitmap = await openBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  let last: Blob | undefined;
  for (const q of QUALITY_STEPS) {
    last = await encode(bitmap, scale, 'image/jpeg', q);
    if (last.size <= TARGET_BYTES) break;
  }
  return { data: await toBase64(last!), fileName: file.name.replace(/\.[^.]*$/, '') + '.jpg' };
}

/** A signature photo (JPG or PNG) as a PNG under 200 KB, the form the server stores and prints. */
export async function prepareSignature(file: File): Promise<string> {
  if (file.size > MAX_PICK_BYTES) throw new Error('The file is too large. Choose a picture under 25 MB.');
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') throw new Error('Use a JPG or PNG picture of your signature.');
  const bitmap = await openBitmap(file);
  let blob: Blob | undefined;
  for (const w of SIGNATURE_WIDTHS) {
    blob = await encode(bitmap, Math.min(1, w / bitmap.width), 'image/png');
    if (blob.size <= SIGNATURE_MAX_BYTES) return toBase64(blob);
  }
  throw new Error('This picture is too detailed. Crop it to just your signature on plain white paper and try again.');
}

/** G1 (D-111): opens an uploaded document in a new tab (a blob URL; browsers block data: URLs there). */
export async function openFile(fileId: string): Promise<void> {
  const tab = window.open('', '_blank');
  const f = await api.documents.file(fileId);
  const url = URL.createObjectURL(await (await fetch(f.dataUrl)).blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
}
