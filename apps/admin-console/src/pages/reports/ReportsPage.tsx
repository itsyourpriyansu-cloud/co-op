// ST-50 Reports catalogue (docs/06, J-13, D-063): cards grouped Collections · Loans · Deposits & Shares
// · Members · Cash & Accounts. MVP reports open ST-51; later ones show why they are not here yet.
// Below: the nine ST-52 printables (letterhead + original-layout form twins).
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, FileText, HandCoins, Landmark, Lock, PiggyBank, Printer, ReceiptIndianRupee, ScrollText, Users, type LucideIcon } from 'lucide-react';
import { TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type } from '@juspay/blend-design-system';
import type { ReportDef } from '@tgs/types';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const GROUPS: Array<{ key: ReportDef['group']; icon: LucideIcon }> = [
  { key: 'Collections', icon: ReceiptIndianRupee },
  { key: 'Loans', icon: HandCoins },
  { key: 'Deposits & Shares', icon: PiggyBank },
  { key: 'Members', icon: Users },
  { key: 'Cash & Accounts', icon: Landmark },
];

/** The nine printables (docs/05, ST-52). `from` tells staff where each one is printed. */
export const PRINTABLES: Array<{ key: string; title: string; form?: string; description: string; link: string; from: string }> = [
  { key: 'receipt', title: 'Receipt', description: 'Counter, bank and salary-recovery receipts with the head-wise allocation.', link: '/payments', from: 'Payments → open a receipt → Print' },
  { key: 'sanction', title: 'Sanction letter', description: 'Issued when the President sanctions a loan.', link: '/loans', from: 'Loans → a sanctioned loan → Sanction letter' },
  { key: 'demand', title: 'Demand sheet', description: 'Department-wise monthly demand for the DDO.', link: '/demand-sheets', from: 'Demand sheets → a sheet → Print' },
  { key: 'fd', title: 'Fixed deposit form + FDR', form: 'F4', description: 'The green F4 form with the cash slip; the FD receipt once the President accepts.', link: '/reports/print/fd-form', from: 'Here, or Deposits → an FD → FDR' },
  { key: 'defaulter', title: 'Defaulter notice', description: 'Letter asking a member to clear overdue dues (REQ-066).', link: '/reports/print/defaulter-notice', from: 'Here, or from the Defaulters list' },
  { key: 'membership', title: 'Membership application', form: 'F1', description: 'The white form, filled from an application or a member record.', link: '/reports/print/membership', from: 'Here, or Joining → an application → Print form' },
  { key: 'loan', title: 'Ordinary / Education loan application', form: 'F2', description: 'The green form with sureties (items 9–10) and the DDO certificate.', link: '/reports/print/loan-form', from: 'Here, or Loans → a loan → Print form' },
  { key: 'salary', title: 'Salary loan application', form: 'F3', description: 'The white slip with the office-use block.', link: '/reports/print/loan-form?product=SALARY', from: 'Here, or Loans → a salary loan → Print form' },
  { key: 'agreement', title: 'Recovery agreement', form: 'F5 / F6', description: 'Salary recovery authorisation to the Secretary and the pay disbursing officer.', link: '/reports/print/agreement', from: 'Here, or Members → a member → Agreements' },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['reports'], queryFn: api.reports.catalogue });
  const reports = q.data?.reports ?? [];
  const live = reports.filter((r) => r.available).length;

  return (
    <>
      <PageHeader title="Reports" description={`MIS reports from the live ledgers, with CSV download and print on the letterhead. ${live ? `${live} available now` : ''}`} />
      <ViewState state={q.isLoading ? 'loading' : q.isError ? 'error' : 'ready'} layout="cards" onRetry={() => void q.refetch()}>
        <div className="flex flex-col gap-8">
          {GROUPS.map((g) => {
            const items = reports.filter((r) => r.group === g.key);
            if (!items.length) return null;
            return (
              <section key={g.key}>
                <SectionTitle>
                  <span className="inline-flex items-center gap-2">
                    <g.icon size={18} strokeWidth={1.75} aria-hidden /> {g.key}
                  </span>
                </SectionTitle>
                <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((r) => (
                    <ReportCard key={r.id} r={r} onOpen={() => navigate(r.kind === 'print' ? r.printLink! : `/reports/${r.id}`)} />
                  ))}
                </div>
              </section>
            );
          })}

          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <Printer size={18} strokeWidth={1.75} aria-hidden /> Printable forms & letters
              </span>
            </SectionTitle>
            <p className="mt-1 text-caption text-fg-tertiary">All nine print on the society letterhead (Regd. No. P-929). The form twins keep the paper layout so the office can file them while it moves to digital.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {PRINTABLES.map((p) => (
                <button key={p.key} type="button" onClick={() => navigate(p.link)} className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-5 text-left shadow-raised transition hover:-translate-y-0.5 hover:border-brand-border">
                  <span className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-control bg-brand-subtle text-brand-text">{p.form ? <ScrollText size={18} aria-hidden /> : <FileText size={18} aria-hidden />}</span>
                    {p.form && <TagV2 text={p.form} size={TagV2Size.XS} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
                  </span>
                  <span className="text-card-title text-fg">{p.title}</span>
                  <span className="text-caption text-fg-secondary">{p.description}</span>
                  <span className="mt-auto pt-2 text-caption text-fg-tertiary">{p.from}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </ViewState>
    </>
  );
}

function ReportCard({ r, onOpen }: { r: ReportDef; onOpen: () => void }) {
  return (
    <button
      type="button"
      disabled={!r.available}
      onClick={onOpen}
      aria-label={r.available ? `Open ${r.title}` : `${r.title}: ${r.note ?? 'not available'}`}
      className={cn('group flex flex-col gap-2 rounded-card border p-5 text-left transition', r.available ? 'border-line bg-surface shadow-raised hover:-translate-y-0.5 hover:border-brand-border' : 'cursor-not-allowed border-dashed border-line bg-surface-subtle')}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={cn('text-card-title', r.available ? 'text-fg' : 'text-fg-tertiary')}>{r.title}</span>
        {r.available ? (
          r.kind === 'print' ? <Printer size={16} className="text-fg-tertiary" aria-hidden /> : <ArrowRight size={16} className="text-fg-tertiary transition group-hover:translate-x-0.5 group-hover:text-brand-text" aria-hidden />
        ) : (
          <Lock size={14} className="text-fg-tertiary" aria-hidden />
        )}
      </span>
      <span className={cn('text-caption', r.available ? 'text-fg-secondary' : 'text-fg-tertiary')}>{r.description}</span>
      <span className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <span className="tabular text-caption text-fg-tertiary">{r.reqId}</span>
        {r.note && <TagV2 text={r.note} size={TagV2Size.XS} color={r.available ? TagV2Color.WARNING : TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} leftSlot={r.available ? undefined : { slot: <BookOpen size={10} /> }} />}
      </span>
    </button>
  );
}
