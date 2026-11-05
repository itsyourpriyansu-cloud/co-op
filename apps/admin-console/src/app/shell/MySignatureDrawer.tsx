// F-01 (D-096): staff keep their signature here; it is printed on what they sign (sanction letter,
// DDO certificate). A PNG, at most 200 KB; the server checks and encrypts it.
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type } from '@juspay/blend-design-system';
import { FileUp } from 'lucide-react';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';

const MAX_BYTES = 200 * 1024;

/** The file's own bytes as base64 (no re-encoding, so the server checks what the user chose). */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function MySignatureDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const mine = useQuery({ queryKey: ['my-signature'], queryFn: api.signatures.mine, enabled: open });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== 'image/png') throw new Error('Choose a PNG image.');
      if (file.size > MAX_BYTES) throw new Error('The file is larger than 200 KB.');
      return api.signatures.upload(await readBase64(file));
    },
    onSuccess: (s) => {
      setError(undefined);
      qc.setQueryData(['my-signature'], s);
    },
    onError: (e) => setError(isApiError(e) ? e.message : e instanceof Error ? e.message : 'Upload failed.'),
  });
  return (
    <SideDrawer open={open} onClose={onClose} title="My signature" description="Printed on what you sign: sanction letters and the DDO certificate. A PNG of your signature on a plain background, at most 200 KB.">
      <div className="flex flex-col gap-4">
        <div className="flex min-h-[8rem] items-center justify-center rounded-card border border-line bg-surface-subtle p-4">
          {mine.data ? <img src={mine.data.dataUrl} alt="Your signature" className="max-h-28 object-contain" /> : <p className="text-body text-fg-tertiary">{mine.isLoading ? 'Loading…' : 'No signature on file yet. You cannot sign sanctions or certificates until you add one.'}</p>}
        </div>
        {mine.data && <p className="text-caption text-fg-tertiary">Uploaded {formatDisplayDateTime(mine.data.uploadedAt)}. Documents you already signed keep the signature they were signed with.</p>}
        {error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={error} />}
        <input ref={input} type="file" accept="image/png" className="sr-only" aria-label="Signature PNG file" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
        <ButtonV2 text={mine.data ? 'Replace signature' : 'Upload signature'} buttonType={ButtonV2Type.PRIMARY} leftSlot={{ slot: <FileUp size={16} /> }} loading={upload.isPending} onClick={() => input.current?.click()} />
      </div>
    </SideDrawer>
  );
}
