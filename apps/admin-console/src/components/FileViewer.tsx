// G1 (D-111, D-129): an uploaded document or photo opens in a panel on the same page, not a new tab.
// Mounted once (main.tsx); `openFile(fileId)` from lib/files shows it. Images show as they are; a PDF
// shows in the browser's own PDF viewer; anything else can be downloaded.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type } from '@juspay/blend-design-system';
import { Download } from 'lucide-react';
import { isApiError } from '@tgs/api-client';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { onOpenFile } from '@/lib/files';

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export function FileViewerHost() {
  const [fileId, setFileId] = useState<string>();
  useEffect(() => onOpenFile(setFileId), []);
  const q = useQuery({ queryKey: ['file', fileId], queryFn: () => api.documents.file(fileId!), enabled: Boolean(fileId), staleTime: 5 * 60_000 });
  const f = fileId ? q.data : undefined;

  // A blob URL: browsers refuse data: URLs in frames and downloads of large files.
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!f) return setUrl(undefined);
    let live = true;
    let made: string | undefined;
    void fetch(f.dataUrl)
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b);
        if (live) setUrl(made);
        else URL.revokeObjectURL(made);
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [f]);

  const close = () => setFileId(undefined);
  const image = f?.mime.startsWith('image/');
  const pdf = f?.mime === 'application/pdf';
  return (
    <SideDrawer
      open={Boolean(fileId)}
      onClose={close}
      title={f?.fileName ?? 'Document'}
      width={Math.min(960, typeof window === 'undefined' ? 960 : window.innerWidth)}
      footer={
        <div className="flex justify-end gap-2">
          {url && f && <ButtonV2 text="Download" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Download size={16} /> }} onClick={() => download(url, f.fileName)} />}
          <ButtonV2 text="Close" buttonType={ButtonV2Type.PRIMARY} onClick={close} />
        </div>
      }
    >
      {q.isLoading && <p className="text-body text-fg-tertiary">Loading…</p>}
      {q.isError && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't open the file" description={isApiError(q.error) ? q.error.message : 'Try again.'} />}
      {f && image && <img src={f.dataUrl} alt={f.fileName} className="mx-auto max-h-[75vh] w-auto rounded-card border border-line object-contain" />}
      {f && pdf && url && <iframe src={url} title={f.fileName} className="h-[75vh] w-full rounded-card border border-line" />}
      {f && !image && !pdf && <p className="text-body text-fg-secondary">This file type can't be shown here. Use Download to open it.</p>}
    </SideDrawer>
  );
}
