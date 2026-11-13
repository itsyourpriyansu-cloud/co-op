// F-01 (D-096): staff keep their signature here; it is printed on what they sign (sanction letter,
// DDO certificate). Any JPG or PNG photo; it is converted to a PNG under 200 KB (D-122) and the server checks and encrypts it.
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Type } from '@juspay/blend-design-system';
import { FileUp, X } from 'lucide-react';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import { SideDrawer } from '@/components/SideDrawer';
import { api } from '@/lib/api';
import { prepareSignature } from '@/lib/files';

export function MySignatureDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  // The converted PNG (base64) waiting for Submit; nothing is sent until then.
  const [pending, setPending] = useState<string>();
  const mine = useQuery({ queryKey: ['my-signature'], queryFn: api.signatures.mine, enabled: open });
  const fail = (e: unknown) => setError(isApiError(e) ? e.message : e instanceof Error ? e.message : 'Upload failed.');
  const choose = useMutation({
    mutationFn: prepareSignature,
    onSuccess: (png) => {
      setError(undefined);
      setPending(png);
    },
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: (png: string) => api.signatures.upload(png),
    onSuccess: (s) => {
      setError(undefined);
      setPending(undefined);
      qc.setQueryData(['my-signature'], s);
    },
    onError: fail,
  });
  const discard = () => {
    setPending(undefined);
    setError(undefined);
  };
  const close = () => {
    discard();
    onClose();
  };
  const busy = choose.isPending || upload.isPending;
  return (
    <SideDrawer open={open} onClose={close} title="My signature" description="Printed on what you sign: sanction letters and the DDO certificate. A photo of your signature on plain white paper (JPG or PNG). It is resized for you.">
      <div className="flex flex-col gap-4">
        <div className="relative flex min-h-32 items-center justify-center rounded-card border border-line bg-surface-subtle p-4">
          {pending ? (
            <>
              <img src={`data:image/png;base64,${pending}`} alt="Selected signature, not saved yet" className="max-h-28 object-contain" />
              <button type="button" aria-label="Remove selected picture" disabled={busy} onClick={discard} className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-muted disabled:opacity-50">
                <X size={18} aria-hidden />
              </button>
            </>
          ) : mine.data ? (
            <img src={mine.data.dataUrl} alt="Your signature" className="max-h-28 object-contain" />
          ) : (
            <p className="text-body text-fg-tertiary">{mine.isLoading ? 'Loading…' : 'No signature on file yet. You cannot sign sanctions or certificates until you add one.'}</p>
          )}
        </div>
        {pending ? (
          <p className="text-caption text-fg-tertiary">Check this is your signature, then press Submit. Nothing is saved until you do.</p>
        ) : (
          mine.data && <p className="text-caption text-fg-tertiary">Uploaded {formatDisplayDateTime(mine.data.uploadedAt)}. Documents you already signed keep the signature they were signed with.</p>
        )}
        {error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={error} />}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          aria-label="Signature image file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) choose.mutate(f);
          }}
        />
        {pending ? (
          <>
            <ButtonV2 text="Submit" buttonType={ButtonV2Type.PRIMARY} loading={upload.isPending} disabled={choose.isPending} onClick={() => upload.mutate(pending)} />
            <ButtonV2 text="Choose a different picture" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FileUp size={16} /> }} disabled={busy} onClick={() => input.current?.click()} />
          </>
        ) : (
          <ButtonV2 text={mine.data ? 'Replace signature' : 'Upload signature'} buttonType={ButtonV2Type.PRIMARY} leftSlot={{ slot: <FileUp size={16} /> }} loading={choose.isPending} onClick={() => input.current?.click()} />
        )}
      </div>
    </SideDrawer>
  );
}
