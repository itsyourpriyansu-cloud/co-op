// ST-52 printables: the society letterhead (seal, name, Regd. No., address) and a print frame.
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Seal } from './Seal';

export function Letterhead() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const society = settings.data?.society;
  return (
    <header className="flex items-center gap-5 border-b-2 border-[#1b3a6b] pb-4">
      <Seal size={64} />
      <div className="flex-1">
        <h1 className="text-section-title">{society?.name ?? 'The Telangana Secretariat Employees Co-operative Credit Society Ltd.'}</h1>
        <p className="text-caption">
          Regd. No. {society?.registrationNo ?? 'P-929'}
          {society?.address ? ` · ${society.address}` : ''}
        </p>
      </div>
    </header>
  );
}

/** White paper frame used on screen and in print. */
export function PrintSheet({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <article data-theme="light" className={`mx-auto rounded-card border border-line bg-surface px-10 py-8 text-[#111] shadow-raised print:border-0 print:px-0 print:shadow-none ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</article>;
}
