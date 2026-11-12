import { api } from './api';

/** G1 (D-111): opens an uploaded document in a new tab (a blob URL; browsers block data: URLs there). */
export async function openFile(fileId: string): Promise<void> {
  const tab = window.open('', '_blank');
  const f = await api.documents.file(fileId);
  const url = URL.createObjectURL(await (await fetch(f.dataUrl)).blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
}
