// Picking a file and reading its bytes, for the signature (F-01) and documents (G1, D-111).
import { Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';

/** The picked file's bytes as base64 (web: the File; native: the local file). Works for image-picker and document-picker assets. */
export async function readBase64(asset: { uri: string }): Promise<string> {
  const blob = (asset as { file?: Blob }).file ?? (await (await fetch(asset.uri)).blob());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });
}

// Documents are photographed, not scanned: a 1600 px long edge at JPEG 70% stays readable (every
// word of an ID card or order) and lands around 150-400 KB instead of 3-8 MB (D-122).
const MAX_EDGE = 1600;
const QUALITY_STEPS = [0.7, 0.55, 0.4];
const TARGET_BYTES = 500 * 1024;
const MAX_PICK_BYTES = 25 * 1024 * 1024; // refuse absurd originals before decoding them
const MAX_PDF_BYTES = 2 * 1024 * 1024; // a PDF cannot be shrunk on the phone

const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4);

/** Resizes to MAX_EDGE and re-encodes as JPEG, lowering quality only until it is under TARGET_BYTES. */
async function compressImage(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((ok, bad) => Image.getSize(uri, (width, height) => ok({ width, height }), () => bad(new Error('Could not read the image.'))));
  const actions = Math.max(width, height) > MAX_EDGE ? [{ resize: width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE } }] : [];
  let last = '';
  for (const compress of QUALITY_STEPS) {
    const out = await ImageManipulator.manipulateAsync(uri, actions, { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    last = out.base64 ?? '';
    if (base64Bytes(last) <= TARGET_BYTES) break;
  }
  return last;
}

const SIGNATURE_MAX_BYTES = 200 * 1024; // the server's limit (SIGNATURE_LIMITS)
const SIGNATURE_WIDTHS = [800, 600, 450, 320];

/** F-01: any photo of a signature (JPG, PNG, HEIC) becomes a PNG under 200 KB, as the forms print it. */
export async function toSignaturePng(uri: string): Promise<string> {
  const { width } = await new Promise<{ width: number; height: number }>((ok, bad) => Image.getSize(uri, (width, height) => ok({ width, height }), () => bad(new Error('Could not read the image.'))));
  let last = '';
  for (const w of SIGNATURE_WIDTHS) {
    const actions = width > w ? [{ resize: { width: w } }] : [];
    last = (await ImageManipulator.manipulateAsync(uri, actions, { format: ImageManipulator.SaveFormat.PNG, base64: true })).base64 ?? '';
    if (base64Bytes(last) <= SIGNATURE_MAX_BYTES) return last;
  }
  if (base64Bytes(last) > SIGNATURE_MAX_BYTES) throw new Error('This picture is too detailed. Crop it to just your signature on plain white paper and try again.');
  return last;
}

/** G1: a JPEG, PNG or PDF from the device. Images are shrunk here, before upload. Undefined when cancelled. */
export async function pickDocumentImage(): Promise<{ data: string; fileName: string } | undefined> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/pdf'], copyToCacheDirectory: true });
  const asset = res.canceled ? undefined : res.assets?.[0];
  if (!asset) return undefined;
  const mime = asset.mimeType ?? '';
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mime)) throw new Error('Use a JPG, PNG or PDF file.');
  if (asset.size && asset.size > MAX_PICK_BYTES) throw new Error('The file is too large. Choose a file under 25 MB.');
  if (mime === 'application/pdf') {
    if (asset.size && asset.size > MAX_PDF_BYTES) throw new Error('The PDF is larger than 2 MB. Photograph the pages instead, or make a smaller PDF.');
    return { data: await readBase64(asset), fileName: asset.name };
  }
  return { data: await compressImage(asset.uri), fileName: asset.name.replace(/\.[^.]*$/, '') + '.jpg' };
}
