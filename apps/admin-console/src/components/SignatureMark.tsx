// F-01 (D-096): a stored signature on a printed form or panel. The image comes from the backend
// as a data URL (staff only) and is never cached by the browser beyond this page.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function SignatureMark({ fileId, name, className = 'mx-auto h-10' }: { fileId: string; name: string; className?: string }) {
  const q = useQuery({ queryKey: ['signature', fileId], queryFn: () => api.signatures.image(fileId), staleTime: Infinity, retry: false });
  if (!q.data) return <span className="text-body italic">{q.isError ? `Signed: ${name}` : ''}</span>;
  return <img src={q.data.dataUrl} alt={`Signature of ${name}`} className={`${className} object-contain`} />;
}
