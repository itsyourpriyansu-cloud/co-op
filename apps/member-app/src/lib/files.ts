// Picking an image and reading its bytes, for the signature (F-01) and documents (G1, D-111).
import * as ImagePicker from 'expo-image-picker';

/** The picked file's bytes as base64 (web: the File; native: the local file). */
export async function readBase64(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const blob = (asset as { file?: Blob }).file ?? (await (await fetch(asset.uri)).blob());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });
}

/** G1: a photo of a document from the library, at most `maxBytes`. Undefined when cancelled. */
export async function pickDocumentImage(maxBytes = 5 * 1024 * 1024): Promise<{ data: string; fileName: string } | undefined> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  const asset = res.canceled ? undefined : res.assets?.[0];
  if (!asset) return undefined;
  if (asset.mimeType && !['image/jpeg', 'image/png'].includes(asset.mimeType)) throw new Error('Use a JPEG or PNG photo.');
  if (asset.fileSize && asset.fileSize > maxBytes) throw new Error(`The photo is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return { data: await readBase64(asset), fileName: asset.fileName ?? 'photo.jpg' };
}
