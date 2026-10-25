// ST-51 Report viewer (J-13, D-063): filters in the URL → GET /reports/:id → grouped table with
// subtotals and a grand total. Download = CSV for Excel (Q-405); Print / PDF = the browser's print of
// the same table on the society letterhead.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileSearch, Printer, UserRound, X } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2SubType, ButtonV2Type, SingleSelectV2, SnackbarV2Variant, TextInputV2, addSnackbarV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { ReportCell, ReportColumn, ReportFilterKey, ReportResult } from '@tgs/types';
import { Letterhead } from '@/components/Letterhead';
import { MemberSearch } from '@/components/MemberSearch';
import { PageHeader } from '@/components/PageHeader';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { downloadCsv } from '../collections/collections';

const FILTER_KEYS: ReportFilterKey[] = ['cycle', 'departmentId', 'minCycles', 'from', 'to', 'scheme', 'memberId', 'product', 'withinMonths'];

function show(c: ReportColumn, v: ReportCell): string {
  if (v === null || v === undefined || v === '') return '—';
  if (c.type === 'money') return formatINR(Number(v));
  if (c.type === 'percent') return `${(Number(v) * 100).toFixed(1)}%`;
  if (c.type === 'date') return formatDisplayDate(String(v));
  if (c.type === 'cycle') return formatCycle(String(v));
  if (c.type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
}

const numeric = (c: ReportColumn) => c.type === 'money' || c.type === 'number' || c.type === 'percent';

export function ReportViewerPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.filter((k) => params.get(k)).map((k) => [k, params.get(k)!])) as Partial<Record<ReportFilterKey, string>>, [params]);
  const cat = useQuery({ queryKey: ['reports'], queryFn: api.reports.catalogue });
  const def = cat.data?.reports.find((r) => r.id === id);
  const opts = cat.data?.options;
  const needsMember = def?.filters.includes('memberId') && !filters.memberId;
  const q = useQuery({ queryKey: ['report', id, filters], queryFn: () => api.reports.run(id, filters), enabled: Boolean(def?.available) && !needsMember, retry: false });
  const r = q.data;
  const [memberLabel, setMemberLabel] = useState<string>();

  const set = (k: ReportFilterKey, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const csv = (res: ReportResult) => {
    const grouped = res.groups.some((g) => g.label);
    const head = [...(grouped ? ['Group'] : []), ...res.columns.map((c) => c.label)];
    const cell = (c: ReportColumn, v: ReportCell) => (c.type === 'money' ? Number(v ?? 0) / 100 : c.type === 'percent' ? Number((Number(v ?? 0) * 100).toFixed(2)) : (v ?? ''));
    const rows: Array<Array<string | number>> = [[res.def.title], [res.filterLabels.join(' · ')], [`Generated ${formatDisplayDateTime(res.generatedAt)} · amounts in rupees`], [], head];
    for (const g of res.groups) {
      for (const row of g.rows) rows.push([...(grouped ? [g.label] : []), ...res.columns.map((c) => cell(c, row[c.key] ?? null))]);
      if (grouped) rows.push([`${g.label} subtotal`, ...res.columns.map((c) => (c.total ? cell(c, g.subtotal[c.key] ?? 0) : ''))]);
    }
    rows.push([...(grouped ? ['Total'] : []), ...res.columns.map((c, i) => (c.total ? cell(c, res.totals[c.key] ?? 0) : !grouped && i === 0 ? 'Total' : ''))]);
    const file = `${res.def.id}-${res.asOf}.csv`;
    downloadCsv(file, rows);
    addSnackbarV2({ header: 'Downloaded', description: `${file} (opens in Excel)`, variant: SnackbarV2Variant.SUCCESS });
  };

  const errorMsg = q.error && isApiError(q.error) ? (Object.values(q.error.fieldErrors ?? {})[0] ?? q.error.message) : undefined;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={def?.title ?? 'Report'}
          description={def?.description}
          actions={
            <div className="flex items-center gap-2">
              <ButtonV2 text="All reports" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <ArrowLeft size={14} /> }} onClick={() => navigate('/reports')} />
              <ButtonV2 text="Download CSV" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Download size={16} /> }} disabled={!r?.rowCount} onClick={() => r && csv(r)} />
              <ButtonV2 text="Print / PDF" leftSlot={{ slot: <Printer size={16} /> }} disabled={!r} onClick={() => window.print()} />
            </div>
          }
        />

        {def && opts && (
          <section className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4 shadow-raised" aria-label="Filters">
            {def.filters.includes('memberId') && (
              <div className="w-80">
                <span className="mb-1 block text-label text-fg">Member</span>
                {filters.memberId ? (
                  <div className="flex items-center justify-between rounded-control border border-line px-3 py-2">
                    <span className="flex items-center gap-2 text-body">
                      <UserRound size={16} aria-hidden /> {memberLabel ?? r?.filterLabels[0] ?? filters.memberId}
                    </span>
                    <ButtonV2 text="Change" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} onClick={() => set('memberId')} />
                  </div>
                ) : (
                  <MemberSearch placeholder="Search by name or General No." onPick={(m) => (setMemberLabel(`${m.name} · ${m.generalNo}`), set('memberId', m.id))} />
                )}
              </div>
            )}
            {def.filters.includes('cycle') && (
              <div className="w-48">
                <SingleSelectV2 label="Month" placeholder="Latest posted" items={[{ items: opts.cycles.map((c) => ({ label: formatCycle(c), value: c })) }]} selected={filters.cycle ?? r?.filters.cycle ?? ''} onSelect={(v) => set('cycle', v)} />
              </div>
            )}
            {def.filters.includes('departmentId') && (
              <div className="w-64">
                <SingleSelectV2 label="Department" placeholder="All departments" items={[{ items: [{ label: 'All departments', value: '' }, ...opts.departments.map((d) => ({ label: d.name, value: d.id }))] }]} selected={filters.departmentId ?? ''} onSelect={(v) => set('departmentId', v || undefined)} />
              </div>
            )}
            {def.filters.includes('product') && (
              <div className="w-56">
                <SingleSelectV2 label="Loan type" placeholder="All loan types" items={[{ items: [{ label: 'All loan types', value: '' }, ...opts.products.map((p) => ({ label: p.name, value: p.code }))] }]} selected={filters.product ?? ''} onSelect={(v) => set('product', v || undefined)} />
              </div>
            )}
            {def.filters.includes('minCycles') && (
              <div className="w-48">
                <SingleSelectV2 label="Short in a row" placeholder={`${opts.defaulterCycles}+ cycles`} items={[{ items: ['1', '2', '3', '4', '6'].map((n) => ({ label: `${n}+ cycle${n === '1' ? '' : 's'}${Number(n) === opts.defaulterCycles ? ' (setting)' : ''}`, value: n })) }]} selected={filters.minCycles ?? String(opts.defaulterCycles)} onSelect={(v) => set('minCycles', v)} />
              </div>
            )}
            {def.filters.includes('withinMonths') && (
              <div className="w-48">
                <SingleSelectV2 label="Retiring within" placeholder="12 months" items={[{ items: ['3', '6', '12', '24', '36'].map((n) => ({ label: `${n} months`, value: n })) }]} selected={filters.withinMonths ?? '12'} onSelect={(v) => set('withinMonths', v)} />
              </div>
            )}
            {def.filters.includes('from') && (
              <div className="w-44">
                <TextInputV2 label="From" type="date" value={filters.from ?? r?.filters.from ?? ''} onChange={(e) => set('from', e.target.value || undefined)} />
              </div>
            )}
            {def.filters.includes('to') && (
              <div className="w-44">
                <TextInputV2 label="To" type="date" value={filters.to ?? r?.filters.to ?? ''} onChange={(e) => set('to', e.target.value || undefined)} error={errorMsg && errorMsg.includes('start') ? { show: true, message: errorMsg } : undefined} />
              </div>
            )}
            {Object.keys(filters).length > 0 && <ButtonV2 text="Clear filters" buttonType={ButtonV2Type.SECONDARY} subType={ButtonV2SubType.INLINE} size={ButtonV2Size.SMALL} leftSlot={{ slot: <X size={14} /> }} onClick={() => setParams({}, { replace: true })} />}
          </section>
        )}
      </div>

      <ViewState
        state={cat.isLoading || q.isLoading ? 'loading' : (cat.data && !def) || needsMember ? 'empty' : q.isError ? (errorMsg && q.error && isApiError(q.error) && q.error.code === 'VALIDATION_ERROR' ? 'partial' : 'error') : r && r.rowCount === 0 ? 'noResults' : 'ready'}
        layout="table"
        onRetry={() => void q.refetch()}
        onClearFilters={() => setParams({}, { replace: true })}
        empty={needsMember ? { icon: UserRound, title: 'Choose a member', description: 'Search for the member whose ledger you want to see.' } : { icon: FileSearch, title: 'Report not found', description: 'Pick a report from the catalogue.', action: { label: 'All reports', onClick: () => navigate('/reports') } }}
        {...(errorMsg ? { notice: errorMsg } : {})}
      >
        {r && <ReportTable r={r} onLink={navigate} />}
      </ViewState>
      {def && !def.available && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <FileSearch size={28} className="text-fg-tertiary" aria-hidden />
          <p className="text-label text-fg">{def.title} is not in the prototype</p>
          <p className="text-caption text-fg-tertiary">{def.note}</p>
        </div>
      )}
    </>
  );
}

function ReportTable({ r, onLink }: { r: ReportResult; onLink: (to: string) => void }) {
  const grouped = r.groups.some((g) => g.label);
  const firstTotal = r.columns.findIndex((c) => c.total);
  const labelSpan = Math.max(1, firstTotal);
  const totalRow = (values: Record<string, number>, label: string, strong: boolean) => (
    <tr className={cn(strong ? 'border-t-2 border-line bg-surface-subtle text-label' : 'bg-surface-subtle/60 text-caption-strong', 'print:bg-transparent')}>
      <td className="px-4 py-2" colSpan={labelSpan}>
        {label}
      </td>
      {r.columns.slice(labelSpan).map((c) => (
        <td key={c.key} className={cn('tabular px-3 py-2', numeric(c) && 'text-right')}>
          {c.total ? show(c, values[c.key] ?? 0) : ''}
        </td>
      ))}
    </tr>
  );

  return (
    <article className="rounded-card border border-line bg-surface shadow-raised print:rounded-none print:border-0 print:shadow-none">
      <div className="hidden px-0 pb-4 print:block">
        <Letterhead />
        <h2 className="mt-4 text-section-title">{r.def.title}</h2>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle px-5 py-3 print:px-0">
        <p className="text-body text-fg-secondary">{r.filterLabels.join(' · ') || 'All records'}</p>
        <p className="text-caption text-fg-tertiary">
          {r.rowCount.toLocaleString('en-IN')} row{r.rowCount === 1 ? '' : 's'} · as of {formatDisplayDate(r.asOf)} · generated {formatDisplayDateTime(r.generatedAt)}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-body print:min-w-0 print:text-[11px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line-subtle text-overline uppercase tracking-wide text-fg-tertiary">
              {r.columns.map((c, i) => (
                <th key={c.key} className={cn('py-3 font-semibold', i === 0 ? 'px-4' : 'px-3', numeric(c) && 'text-right')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.groups.map((g) => (
              <GroupRows key={g.label || 'all'} label={grouped ? g.label : ''}>
                {g.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-line-subtle last:border-b-0 hover:bg-surface-subtle">
                    {r.columns.map((c, i) => {
                      const v = row[c.key] ?? null;
                      const link = i === 0 && r.links ? r.links[String(v)] : undefined;
                      return (
                        <td key={c.key} className={cn('py-2', i === 0 ? 'px-4' : 'px-3', numeric(c) && 'tabular text-right', c.type === 'date' && 'tabular whitespace-nowrap')}>
                          {link ? (
                            <button type="button" className="text-link underline-offset-2 hover:underline print:text-fg" onClick={() => onLink(link)}>
                              {show(c, v)}
                            </button>
                          ) : c.type === 'money' && v === 0 ? (
                            <span className="text-fg-tertiary">–</span>
                          ) : (
                            show(c, v)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {grouped ? totalRow(g.subtotal, `${g.label} · ${g.rows.length} row${g.rows.length === 1 ? '' : 's'}`, false) : null}
              </GroupRows>
            ))}
          </tbody>
          {firstTotal >= 0 && <tfoot>{totalRow(r.totals, 'Grand total', true)}</tfoot>}
        </table>
      </div>
    </article>
  );
}

function GroupRows({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      {label ? (
        <tr className="bg-brand-subtle/50 print:bg-transparent">
          <td colSpan={99} className="px-4 py-2 text-label text-brand-text print:text-fg">
            {label}
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}
