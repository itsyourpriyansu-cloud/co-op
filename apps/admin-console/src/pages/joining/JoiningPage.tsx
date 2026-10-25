// ST-14 Joining: membership applications from the Member App, as a stage board or a table.
// Refreshes every few seconds, so a submission on the phone appears here live.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleUserRound, Inbox, KanbanSquare, Rows3, Search, TriangleAlert, UserCheck, UserPlus, Users } from 'lucide-react';
import {
  Checkbox,
  CheckboxSize,
  ColumnType,
  SearchInputV2,
  SingleSelectV2,
  StatCardV2,
  StatCardV2Variant,
  TabsV2,
  TabsV2List,
  TabsV2Trigger,
  TabsV2Variant,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  TooltipV2,
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { formatDisplayDate } from '@tgs/domain';
import type { MembershipRow } from '@tgs/types';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ageTone, BOARD_COLUMNS, daysLabel, FLAG_LABEL } from './joining';

type View = 'board' | 'table';
const VIEW_KEY = 'tgs.joining.view';

const TONE_CLASS = { neutral: 'bg-surface-muted text-fg-secondary', warning: 'bg-warning-bg text-warning-fg', danger: 'bg-danger-bg text-danger-fg' } as const;

function AgeChip({ days }: { days: number }) {
  return <span className={cn('tabular whitespace-nowrap rounded-pill px-2 py-0.5 text-caption-strong', TONE_CLASS[ageTone(days)])}>{daysLabel(days)}</span>;
}

function Flags({ row }: { row: MembershipRow }) {
  const serious = row.flags.filter((f) => f !== 'RETURNED');
  if (!serious.length) return null;
  return (
    <TooltipV2 content={serious.map((f) => FLAG_LABEL[f]).join(' · ')}>
      <span className="inline-flex items-center gap-1 text-caption-strong text-warning-fg">
        <TriangleAlert size={14} aria-hidden /> {serious.length}
        <span className="sr-only">{serious.map((f) => FLAG_LABEL[f]).join(', ')}</span>
      </span>
    </TooltipV2>
  );
}

function BoardCard({ row, onOpen }: { row: MembershipRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full flex-col gap-3 rounded-card border bg-surface p-3.5 text-left shadow-flat transition-shadow hover:shadow-hover focus-visible:outline-2 focus-visible:outline-focus',
        row.waitingOnMe ? 'border-brand-border ring-1 ring-brand-border' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-label text-fg group-hover:text-brand-text">{row.name}</p>
          <p className="truncate text-caption text-fg-tertiary">{row.designation}</p>
        </div>
        {row.waitingOnMe && <TagV2 text="You" size={TagV2Size.XS} color={TagV2Color.PRIMARY} type={TagV2Type.ATTENTIVE} subType={TagV2SubType.ROUNDED} />}
      </div>
      <p className="truncate text-caption text-fg-secondary">{row.departmentName}</p>
      <div className="flex items-center justify-between gap-2 border-t border-line-subtle pt-2.5">
        <span className="tabular truncate whitespace-nowrap text-caption text-fg-tertiary">{row.applicationNo}</span>
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <Flags row={row} />
          <AgeChip days={row.daysInStage} />
        </span>
      </div>
    </button>
  );
}

function Board({ rows, onOpen }: { rows: MembershipRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="grid auto-cols-[minmax(248px,1fr)] grid-flow-col gap-4">
        {BOARD_COLUMNS.map((col) => {
          const items = rows.filter((r) => r.status === col.status);
          return (
            <section key={col.status} className="flex min-h-[320px] flex-col rounded-card bg-surface-subtle p-2.5" aria-label={col.title}>
              <header className="mb-2.5 flex items-start justify-between gap-2 px-1">
                <div>
                  <h2 className="text-label text-fg">{col.title}</h2>
                  <p className="text-caption text-fg-tertiary">{col.hint}</p>
                </div>
                <span className="tabular rounded-pill bg-surface px-2 py-0.5 text-caption-strong text-fg-secondary shadow-flat">{items.length}</span>
              </header>
              <div className="flex flex-col gap-2.5">
                {items.map((r) => (
                  <BoardCard key={r.id} row={r} onOpen={() => onOpen(r.id)} />
                ))}
                {items.length === 0 && <p className="rounded-control border border-dashed border-line px-3 py-6 text-center text-caption text-fg-tertiary">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type TableRow = MembershipRow & Record<string, unknown>;

export function JoiningPage() {
  const navigate = useNavigate();
  const [view, setViewState] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'board';
    } catch {
      return 'board';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const list = useQuery({ queryKey: ['membership-applications'], queryFn: api.applications.list, refetchInterval: 5000 });
  const data = list.data;

  const departments = useMemo(() => [...new Map((data?.rows ?? []).map((r) => [r.departmentId, r.departmentName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) => (!needle || r.name.toLowerCase().includes(needle) || r.applicationNo.toLowerCase().includes(needle)) && (!dept || r.departmentId === dept) && (!mineOnly || r.waitingOnMe),
    );
  }, [data, q, dept, mineOnly]);
  const filtersOn = Boolean(q || dept || mineOnly);
  const clear = () => {
    setQ('');
    setDept('');
    setMineOnly(false);
  };

  const inFlight = data ? data.rows.filter((r) => !['ACTIVE', 'REJECTED', 'WITHDRAWN'].includes(r.status)).length : 0;
  const boardRows = filtered.filter((r) => BOARD_COLUMNS.some((c) => c.status === r.status));
  const open = (id: string) => navigate(`/joining/${id}`);

  const columns: ColumnDefinition<TableRow>[] = [
    {
      field: 'name',
      header: 'Applicant',
      minWidth: '200px',
      type: ColumnType.REACT_ELEMENT, isSortable: false,
      renderCell: (_v, r) => (
        <div className="min-w-0">
          <p className="truncate text-label text-fg">{r.name}</p>
          <p className="tabular text-caption text-fg-tertiary">{r.applicationNo}</p>
        </div>
      ),
    },
    { field: 'departmentName', header: 'Department', type: ColumnType.TEXT, minWidth: '180px', maxWidth: '240px' },
    { field: 'status', header: 'Stage', type: ColumnType.REACT_ELEMENT, isSortable: false, minWidth: '210px', renderCell: (_v, r) => <StatusTag entity="membership" status={r.status} /> },
    {
      field: 'waitingOn',
      header: 'Waiting on',
      minWidth: '200px',
      type: ColumnType.REACT_ELEMENT, isSortable: false,
      renderCell: (_v, r) =>
        r.waitingOnMe ? <TagV2 text="You" size={TagV2Size.XS} color={TagV2Color.PRIMARY} type={TagV2Type.ATTENTIVE} subType={TagV2SubType.ROUNDED} /> : <span className="text-caption text-fg-secondary">{r.waitingOn ?? (r.allottedGeneralNo ? `General No. ${r.allottedGeneralNo}` : '—')}</span>,
    },
    { field: 'daysInStage', header: 'In stage', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => (r.status === 'ACTIVE' || r.status === 'REJECTED' ? <span className="text-caption text-fg-tertiary">—</span> : <AgeChip days={r.daysInStage} />) },
    { field: 'flags', header: 'Flags', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <Flags row={r} /> },
    { field: 'submittedOn', header: 'Submitted', type: ColumnType.REACT_ELEMENT, isSortable: false, minWidth: '130px', renderCell: (_v, r) => <span className="tabular text-caption text-fg-secondary">{r.submittedOn ? formatDisplayDate(r.submittedOn) : '—'}</span> },
  ];

  const state = list.isLoading ? 'loading' : list.isError ? 'error' : !data?.rows.length ? 'empty' : !filtered.length ? 'noResults' : 'ready';

  return (
    <>
      <PageHeader
        title="Joining"
        description={`Membership applications from the Member App${data?.scope.departmentName ? ` · ${data.scope.departmentName} department only` : ''}. Open one to certify, review or approve it.`}
        meta={data && data.waitingOnMe > 0 ? <TagV2 text={`${data.waitingOnMe} waiting on you`} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
        actions={
          <TabsV2 value={view} onValueChange={(v) => setView(v as View)}>
            <TabsV2List variant={TabsV2Variant.BOXED}>
              <TabsV2Trigger value="board" variant={TabsV2Variant.BOXED} leftSlot={<KanbanSquare size={16} aria-hidden />}>
                Board
              </TabsV2Trigger>
              <TabsV2Trigger value="table" variant={TabsV2Variant.BOXED} leftSlot={<Rows3 size={16} aria-hidden />}>
                Table
              </TabsV2Trigger>
            </TabsV2List>
          </TabsV2>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardV2 title="In progress" value={String(inFlight)} variant={StatCardV2Variant.NUMBER} titleIcon={<Users size={16} />} subtitle="Submitted, not yet decided" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Waiting on you" value={String(data?.waitingOnMe ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<Inbox size={16} />} subtitle="Your stage, oldest first" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="With applicants" value={String(data?.counts.INFO_REQUESTED ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<CircleUserRound size={16} />} subtitle="Returned for correction" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="New members" value={String(data?.counts.ACTIVE ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<UserCheck size={16} />} subtitle="General No. allotted" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <SearchInputV2 value={q} placeholder="Search by name or application no." leftSlot={<Search size={16} />} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!data?.scope.departmentId && (
          <div className="w-64">
            <SingleSelectV2
              placeholder="All departments"
              items={[{ items: [{ label: 'All departments', value: '' }, ...departments.map(([value, label]) => ({ label, value }))] }]}
              selected={dept}
              onSelect={setDept}
              search={{ show: true, placeholder: 'Search departments' }}
            />
          </div>
        )}
        <Checkbox checked={mineOnly} onCheckedChange={(v) => setMineOnly(v === true)} size={CheckboxSize.MEDIUM}>
          Waiting on me
        </Checkbox>
        <span className="ml-auto text-caption text-fg-tertiary" aria-live="polite">
          {list.isFetching && !list.isLoading ? 'Updating…' : `Live · ${filtered.length} shown`}
        </span>
      </div>

      <ViewState
        state={state}
        layout={view === 'board' ? 'cards' : 'table'}
        onRetry={() => void list.refetch()}
        onClearFilters={clear}
        empty={{ icon: UserPlus, title: 'No applications yet', description: 'Applications submitted in the Member App appear here within a few seconds.' }}
      >
        {view === 'board' ? (
          <>
            <Board rows={boardRows} onOpen={open} />
            {filtered.length > boardRows.length && (
              <p className="mt-3 text-caption text-fg-tertiary">
                {filtered.length - boardRows.length} decided application(s) (members and rejected) are in the{' '}
                <button type="button" className="text-link underline-offset-2 hover:underline" onClick={() => setView('table')}>
                  table view
                </button>
                .
              </p>
            )}
          </>
        ) : (
          <Table<TableRow> data={filtered as TableRow[]} columns={columns} idField="id" isHoverable onRowClick={(r) => open(r.id)} showToolbar={false} />
        )}
      </ViewState>
      {filtersOn && state === 'ready' && (
        <button type="button" className="mt-3 text-caption text-link hover:underline" onClick={clear}>
          Clear filters
        </button>
      )}
    </>
  );
}
