// ST-42 Demand sheet detail (+ BR-030 certify & send to DDO). One row per member with a column per
// head in recovery order (BR-011), totals, and — once posted — recovered / short with the allocation
// per row. Export (CSV for Excel), Print (letterhead), Enter recovery → ST-43.
import { Fragment, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronRight, Download, FileSearch, FlaskConical, Printer, Send } from 'lucide-react';
import { AlertV2, AlertV2SubType, AlertV2Type, ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SnackbarV2Variant, StepperV2, StepperV2StepStatus, TextAreaV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { Letterhead } from '@/components/Letterhead';
import { Money } from '@/components/Money';
import { SideDrawer } from '@/components/SideDrawer';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { HEAD_COLUMNS, cycleLabel, downloadCsv } from './collections';

type Drawer = 'certify' | 'sendToDdo' | null;

function exportCsv(d: DemandSheetDetail) {
  const heads = HEAD_COLUMNS.filter((h) => d.totals.heads[h.head]);
  const posted = d.sheet.status === 'RECOVERY_POSTED';
  const rows: Array<Array<string | number>> = [
    ['General No.', 'Name', 'Designation', ...heads.map((h) => h.label), 'Total demand', ...(posted ? ['Recovered', 'Short'] : [])],
    ...d.lines.map((l) => [l.generalNo, l.name, l.designation, ...heads.map((h) => (l.heads[h.head] ?? 0) / 100), l.totalDemand / 100, ...(posted ? [(l.recovered ?? 0) / 100, (l.short ?? 0) / 100] : [])]),
    ['', 'Total', '', ...heads.map((h) => (d.totals.heads[h.head] ?? 0) / 100), d.totals.demand / 100, ...(posted ? [d.totals.recovered / 100, d.totals.short / 100] : [])],
  ];
  downloadCsv(`demand-${d.sheet.cycle}-${d.department?.code ?? d.sheet.departmentId}.csv`, rows);
}

export function DemandSheetPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [remarks, setRemarks] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const done = (next: DemandSheetDetail, header: string) => {
    qc.setQueryData(['demand-sheet', id], next);
    void qc.invalidateQueries({ queryKey: ['demand-overview'] });
    void qc.invalidateQueries({ queryKey: ['work-queue'] });
    addSnackbarV2({ header, description: `${next.department?.name} · ${cycleLabel(next.sheet.cycle)}`, variant: SnackbarV2Variant.SUCCESS });
    setDrawer(null);
    setRemarks('');
  };
  const m = useMutation({
    mutationFn: (a: 'certify' | 'sendToDdo') => api.demand.act(id, a, remarks.trim() ? { remarks: remarks.trim() } : {}),
    onSuccess: (next, a) => done(next, a === 'certify' ? 'Certified correct' : 'Sent to the DDO'),
  });
  const demo = useMutation({ mutationFn: () => api.demand.demoAct(id), onSuccess: (next) => done(next, 'Demo: step completed as the Accountant') });
  const d = q.data;
  const sh = d?.sheet;
  const posted = sh?.status === 'RECOVERY_POSTED';
  const heads = d ? HEAD_COLUMNS.filter((h) => d.totals.heads[h.head]) : [];
  const span = heads.length + 4 + (posted ? 2 : 0);

  return (
    <>
      <div className="print:hidden">
        <ButtonV2 text="Demand sheets" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate(sh ? `/demand-sheets?cycle=${sh.cycle}` : '/demand-sheets')} />
      </div>
      <ViewState
        state={q.isLoading ? 'loading' : isApiError(q.error) && q.error.status === 404 ? 'empty' : q.isError ? 'error' : 'ready'}
        layout="detail"
        onRetry={() => void q.refetch()}
        empty={{ icon: FileSearch, title: 'Sheet not found', description: 'It may be outside your department.', action: { label: 'Back', onClick: () => navigate('/demand-sheets') } }}
      >
        {d && sh && (
          <div className="mt-3 flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-page-title text-fg">
                    {d.department?.name} · {cycleLabel(sh.cycle)}
                  </h1>
                  <StatusTag entity="demandSheet" status={sh.status} />
                </div>
                <p className="mt-1 text-body text-fg-secondary">
                  DDO {d.department?.ddoName}, {d.department?.ddoDesignation} · {d.lines.length} members · demand <Money value={d.totals.demand} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ButtonV2 text="Export" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Download size={16} /> }} onClick={() => exportCsv(d)} />
                <ButtonV2 text="Print" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Printer size={16} /> }} onClick={() => window.print()} />
                {d.actions.includes('certify') && <ButtonV2 text="Certify" leftSlot={{ slot: <BadgeCheck size={16} /> }} onClick={() => setDrawer('certify')} />}
                {d.actions.includes('sendToDdo') && <ButtonV2 text="Send to DDO" leftSlot={{ slot: <Send size={16} /> }} onClick={() => setDrawer('sendToDdo')} />}
                {d.actions.includes('postRecovery') && <ButtonV2 text="Enter recovery" onClick={() => navigate(`/demand-sheets/${id}/recovery`)} />}
                {d.demoActAs && <ButtonV2 text={`Act as ${d.demoActAs}`} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <FlaskConical size={16} /> }} loading={demo.isPending} onClick={() => demo.mutate()} />}
              </div>
            </header>

            <div className="rounded-card border border-line bg-surface px-5 py-4 shadow-raised print:hidden">
              <StepperV2 steps={d.stages.map((s, i) => ({ id: i + 1, title: s.title, status: s.status === 'done' ? StepperV2StepStatus.COMPLETED : s.status === 'current' ? StepperV2StepStatus.CURRENT : StepperV2StepStatus.PENDING, ...(s.by ? { description: `${s.by}${s.date ? ` · ${s.date}` : ''}` } : {}) }))} />
            </div>

            {sh.status === 'SENT_TO_DDO' && <AlertV2 type={AlertV2Type.PRIMARY} subType={AlertV2SubType.SUBTLE} heading="With the DDO for deduction" description="When the department reports what it deducted, enter the recovered amounts and post them. Short amounts become the member's dues." />}

            <section className="rounded-card border border-line bg-surface shadow-raised print:border-0 print:shadow-none">
              <div className="hidden px-5 pt-5 print:block">
                <Letterhead />
                <h2 className="mt-4 text-center text-card-title tracking-wide">
                  DEMAND · {d.department?.name.toUpperCase()} · {cycleLabel(sh.cycle).toUpperCase()}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-body">
                  <thead>
                    <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
                      <th className="w-8 px-3 py-3 print:hidden" />
                      <th className="px-2 py-3 font-semibold">No.</th>
                      <th className="px-2 py-3 font-semibold">Member</th>
                      {heads.map((h) => (
                        <th key={h.head} className="px-2 py-3 text-right font-semibold">
                          {h.label}
                        </th>
                      ))}
                      <th className="px-2 py-3 text-right font-semibold">Demand</th>
                      {posted && <th className="px-2 py-3 text-right font-semibold">Recovered</th>}
                      {posted && <th className="px-4 py-3 text-right font-semibold">Short</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {d.lines.map((l) => (
                      <Fragment key={l.memberId}>
                        <tr className={cn('cursor-pointer hover:bg-surface-subtle', (l.short ?? 0) > 0 && 'bg-danger-bg/40')} onClick={() => setOpen(open === l.memberId ? null : l.memberId)}>
                          <td className="px-3 py-2.5 text-fg-tertiary print:hidden">{open === l.memberId ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}</td>
                          <td className="tabular px-2 py-2.5 text-fg-secondary">{l.generalNo}</td>
                          <td className="px-2 py-2.5">
                            <span className="text-label text-fg">{l.name}</span>
                            <span className="ml-2 text-caption text-fg-tertiary">{l.designation}</span>
                          </td>
                          {heads.map((h) => (
                            <td key={h.head} className="px-2 py-2.5 text-right">
                              {l.heads[h.head] ? <Money value={l.heads[h.head]!} /> : <span className="text-fg-disabled">—</span>}
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-right text-label">
                            <Money value={l.totalDemand} />
                          </td>
                          {posted && (
                            <td className="px-2 py-2.5 text-right">
                              <Money value={l.recovered ?? 0} />
                            </td>
                          )}
                          {posted && <td className="px-4 py-2.5 text-right">{l.short ? <Money value={l.short} tone="debit" /> : <span className="text-caption text-success-fg">—</span>}</td>}
                        </tr>
                        {open === l.memberId && (
                          <tr className="bg-surface-subtle print:hidden">
                            <td colSpan={span} className="px-12 py-3">
                              <p className="mb-2 text-caption-strong text-fg-secondary">{posted ? 'How the recovery was applied (BR-011 order)' : 'Demand in recovery order (BR-011)'}</p>
                              <ol className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                                {l.components.map((c, i) => (
                                  <li key={i} className="flex items-center justify-between gap-3 rounded-control bg-surface px-3 py-1.5">
                                    <span className="text-caption text-fg">
                                      {i + 1}. {c.label}
                                      {c.loanNo ? <span className="text-fg-tertiary"> · {c.loanNo}</span> : null}
                                    </span>
                                    <span className="tabular text-caption">
                                      {posted ? (
                                        <>
                                          <span className={c.allocated < c.amount ? 'text-danger-fg' : 'text-success-fg'}>{formatINR(c.allocated)}</span>
                                          <span className="text-fg-tertiary"> / {formatINR(c.amount)}</span>
                                        </>
                                      ) : (
                                        formatINR(c.amount)
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line bg-surface-subtle text-label text-fg">
                      <td className="print:hidden" />
                      <td className="px-2 py-3" colSpan={2}>
                        Total · {d.lines.length} members
                      </td>
                      {heads.map((h) => (
                        <td key={h.head} className="px-2 py-3 text-right">
                          <Money value={d.totals.heads[h.head] ?? 0} />
                        </td>
                      ))}
                      <td className="px-2 py-3 text-right">
                        <Money value={d.totals.demand} />
                      </td>
                      {posted && (
                        <td className="px-2 py-3 text-right">
                          <Money value={d.totals.recovered} />
                        </td>
                      )}
                      {posted && <td className="px-4 py-3 text-right">{d.totals.short ? <Money value={d.totals.short} tone="debit" /> : '—'}</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {sh.certified && (
                <p className="flex items-center gap-2 border-t border-line-subtle px-5 py-3 text-caption text-fg-secondary">
                  <BadgeCheck size={16} className="text-success-fg" aria-hidden /> Certified correct by {sh.certified.byName}, {formatDisplayDateTime(sh.certified.at)}
                  {sh.sent ? ` · sent to the DDO ${formatDisplayDateTime(sh.sent.at)}` : ''}
                  {sh.posted ? ` · recovery posted ${formatDisplayDateTime(sh.posted.at)}` : ''}
                </p>
              )}
            </section>

            <SideDrawer
              open={drawer !== null}
              onClose={() => setDrawer(null)}
              title={drawer === 'certify' ? 'Certify the demand sheet' : 'Send to the DDO'}
              description={drawer === 'certify' ? 'BR-030: you confirm the demand is correct. Your name and the time are stamped on the sheet.' : 'The DDO deducts these amounts from the salaries. Sending is simulated (email to the DDO).'}
              footer={
                <div className="flex justify-end gap-2">
                  <ButtonV2 text="Cancel" buttonType={ButtonV2Type.SECONDARY} onClick={() => setDrawer(null)} />
                  <ButtonV2 text={drawer === 'certify' ? 'Certify correct' : 'Send'} loading={m.isPending} onClick={() => drawer && m.mutate(drawer)} />
                </div>
              }
            >
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4 rounded-card border border-line bg-surface-subtle px-4 py-3">
                  <div>
                    <p className="text-caption text-fg-tertiary">Members</p>
                    <p className="tabular text-label text-fg">{d.lines.length}</p>
                  </div>
                  <div>
                    <p className="text-caption text-fg-tertiary">Total demand</p>
                    <p className="text-label text-fg">
                      <Money value={d.totals.demand} />
                    </p>
                  </div>
                  {heads.map((h) => (
                    <div key={h.head}>
                      <p className="text-caption text-fg-tertiary">{h.label}</p>
                      <p className="text-body text-fg">
                        <Money value={d.totals.heads[h.head] ?? 0} />
                      </p>
                    </div>
                  ))}
                </div>
                {drawer === 'sendToDdo' && (
                  <p className="text-body text-fg-secondary">
                    To <strong className="text-fg">{d.department?.ddoName}</strong>, {d.department?.ddoDesignation}, {d.department?.name}.
                  </p>
                )}
                <TextAreaV2 label="Remarks (optional)" placeholder={drawer === 'certify' ? 'e.g. Checked against the loan register.' : 'e.g. Please deduct from the October salary.'} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} />
                {m.error && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't save" description={isApiError(m.error) ? m.error.message : 'Try again.'} />}
              </div>
            </SideDrawer>
          </div>
        )}
      </ViewState>
    </>
  );
}
