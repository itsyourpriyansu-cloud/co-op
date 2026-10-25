// ST-30 Deposits index: tabs FD · Requests · CRD · SRDS · Savings, maturing-within filter, search,
// server paging. FD requests from the app appear under Requests within seconds.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, Inbox, Landmark, PiggyBank, Plus, Search, Wallet } from 'lucide-react';
import {
  ButtonV2,
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
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { formatDisplayDate, formatINRCompact } from '@tgs/domain';
import type { DepositListParams, DepositRow, DepositTab } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';

type Row = DepositRow & Record<string, unknown>;

const TABS: Array<{ value: DepositTab; label: string }> = [
  { value: 'FD', label: 'Fixed deposits' },
  { value: 'REQUESTS', label: 'FD requests' },
  { value: 'CRD', label: 'CRD' },
  { value: 'SRDS', label: 'SRDS' },
  { value: 'SAVINGS', label: 'Savings' },
];
const MATURING = [
  { label: 'Any maturity', value: '' },
  { label: 'Maturing in 30 days', value: '30' },
  { label: 'Maturing in 60 days', value: '60' },
  { label: 'Maturing in 90 days', value: '90' },
];

export function DepositsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DepositTab>('FD');
  const [maturing, setMaturing] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params: DepositListParams = { tab, ...(maturing && tab === 'FD' ? { maturingWithinDays: Number(maturing) } : {}), ...(q.trim() ? { q: q.trim() } : {}), page, pageSize };
  const list = useQuery({ queryKey: ['deposits', params], queryFn: () => api.deposits.list(params), placeholderData: keepPreviousData, refetchInterval: 5000 });
  const data = list.data;
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const fd = tab === 'FD' || tab === 'REQUESTS';

  const columns: ColumnDefinition<Row>[] = [
    {
      field: 'accountNo',
      header: tab === 'REQUESTS' ? 'Request' : 'Account',
      minWidth: '160px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div>
          <p className="tabular text-label text-fg">{r.fdrNo ?? r.accountNo}</p>
          <p className="text-caption text-fg-tertiary">
            {r.fdrNo ? r.accountNo : `opened ${formatDisplayDate(r.openedOn)}`}
            {r.joint ? ' · joint' : ''}
            {r.minor ? ' · minor' : ''}
          </p>
        </div>
      ),
    },
    {
      field: 'memberName',
      header: 'Member',
      minWidth: '200px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="min-w-0">
          <p className="truncate text-body text-fg">{r.memberName}</p>
          <p className="truncate text-caption text-fg-tertiary">
            No. {r.generalNo} · {r.departmentName}
          </p>
        </div>
      ),
    },
    {
      field: 'amount',
      header: fd ? 'Principal' : 'Balance',
      minWidth: '130px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div>
          <Money value={r.amount} className="text-body text-fg" />
          <p className="text-caption text-fg-tertiary">
            {r.ratePercent}%{r.tenureMonths ? ` · ${r.tenureMonths} mths` : r.monthlyAmount ? ' · monthly' : ''}
          </p>
        </div>
      ),
    },
    ...(tab === 'FD'
      ? [
          {
            field: 'maturityDate',
            header: 'Matures',
            minWidth: '150px',
            type: ColumnType.REACT_ELEMENT,
            isSortable: false,
            renderCell: (_v: unknown, r: Row) => (
              <div>
                <p className="tabular text-body text-fg">{r.maturityDate ? formatDisplayDate(r.maturityDate) : '—'}</p>
                <p className={r.daysToMaturity !== undefined && r.daysToMaturity >= 0 && r.daysToMaturity <= 30 ? 'text-caption text-warning-fg' : 'text-caption text-fg-tertiary'}>{r.maturityValue ? <Money value={r.maturityValue} /> : null}</p>
              </div>
            ),
          } satisfies ColumnDefinition<Row>,
        ]
      : []),
    {
      field: 'status',
      header: 'Status',
      minWidth: '200px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="flex flex-col items-start gap-1">
          <div className="flex flex-wrap gap-1">
            <StatusTag entity="deposit" status={r.status} size={TagV2Size.XS} />
            {r.pledged && <TagV2 text="Pledged" size={TagV2Size.XS} color={TagV2Color.PURPLE} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
          </div>
          {r.waitingOn && <span className="max-w-[220px] truncate text-caption text-fg-tertiary">{r.waitingOn}</span>}
        </div>
      ),
    },
  ];

  const state = list.isLoading ? 'loading' : list.isError ? 'error' : !data?.counts[tab] ? 'empty' : !data.total ? 'noResults' : 'ready';
  const t = data?.totals;

  return (
    <>
      <PageHeader
        title="Deposits"
        description="Fixed deposits with their requests from the app, and the CRD, SRDS and Savings accounts."
        meta={t?.requestsOpen ? <TagV2 text={`${t.requestsOpen} FD requests open`} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
        actions={data?.canOpen ? <ButtonV2 text="Open FD at counter" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => navigate('/deposits/new')} /> : undefined}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardV2 title="Fixed deposits held" value={t ? formatINRCompact(t.fdPrincipal) : '—'} variant={StatCardV2Variant.NUMBER} titleIcon={<Landmark size={16} />} subtitle={`${data?.counts.FD ?? 0} accounts`} skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Maturing in 30 days" value={String(t?.maturing30 ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<CalendarClock size={16} />} subtitle="Remind, renew or pay out" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="CRD + SRDS" value={t ? formatINRCompact(t.crd + t.srds) : '—'} variant={StatCardV2Variant.NUMBER} titleIcon={<PiggyBank size={16} />} subtitle="From monthly salary recovery" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Savings" value={t ? formatINRCompact(t.savings) : '—'} variant={StatCardV2Variant.NUMBER} titleIcon={<Wallet size={16} />} subtitle={`${data?.counts.SAVINGS ?? 0} accounts`} skeleton={{ show: list.isLoading, variant: 'pulse' }} />
      </div>
      <div className="mb-4 overflow-x-auto">
        <TabsV2 value={tab} onValueChange={(v) => reset(() => setTab(v as DepositTab))}>
          <TabsV2List variant={TabsV2Variant.UNDERLINE}>
            {TABS.map((x) => (
              <TabsV2Trigger key={x.value} value={x.value} variant={TabsV2Variant.UNDERLINE} rightSlot={<span className="tabular rounded-pill bg-surface-muted px-1.5 text-caption-strong text-fg-secondary">{data?.counts[x.value] ?? 0}</span>}>
                {x.label}
              </TabsV2Trigger>
            ))}
          </TabsV2List>
        </TabsV2>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <SearchInputV2 value={q} placeholder="Member, General No., account or FDR no." leftSlot={<Search size={16} />} onChange={(e) => reset(() => setQ(e.target.value))} />
        </div>
        {tab === 'FD' && (
          <div className="w-56">
            <SingleSelectV2 placeholder="Any maturity" items={[{ items: MATURING }]} selected={maturing} onSelect={(v) => reset(() => setMaturing(v))} />
          </div>
        )}
        <span className="ml-auto text-caption text-fg-tertiary" aria-live="polite">
          {list.isFetching && !list.isLoading ? 'Updating…' : data ? `Live · ${data.total} found` : ''}
        </span>
      </div>
      <ViewState
        state={state}
        layout="table"
        onRetry={() => void list.refetch()}
        onClearFilters={() => reset(() => {
          setQ('');
          setMaturing('');
        })}
        empty={{ icon: tab === 'REQUESTS' ? Inbox : Landmark, title: tab === 'REQUESTS' ? 'No FD requests' : 'No accounts here', description: tab === 'REQUESTS' ? 'Requests from the Member App and the counter appear here.' : undefined }}
      >
        <Table<Row>
          data={(data?.items ?? []) as Row[]}
          columns={columns}
          idField="id"
          isHoverable
          onRowClick={(r) => navigate(`/deposits/${r.id}`)}
          showToolbar={false}
          serverSidePagination
          pagination={{ currentPage: page, pageSize, totalRows: data?.total ?? 0, pageSizeOptions: [25, 50, 100] }}
          onPageChange={setPage}
          onPageSizeChange={(s) => reset(() => setPageSize(s))}
        />
      </ViewState>
    </>
  );
}
