// ST-20 Loans index: product tabs, status / department filters, server-side search and paging.
// Applications submitted on the phone show up here live (M4 exit test).
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { HandCoins, Plus, Search } from 'lucide-react';
import {
  ButtonV2,
  ColumnType,
  SearchInputV2,
  SingleSelectV2,
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
import { formatCycle, formatDisplayDate } from '@tgs/domain';
import type { LoanListParams, LoanProductCode, LoanRow, LoanStatusGroup } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { GROUP_ITEMS, PRODUCT_TABS } from './loans';

type Row = LoanRow & Record<string, unknown>;

export function LoansPage() {
  const navigate = useNavigate();
  const [product, setProduct] = useState<LoanProductCode | 'ALL' | 'TOPUP'>('ALL');
  const [group, setGroup] = useState<LoanStatusGroup | ''>('IN_PROCESS');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const params: LoanListParams = { ...(product !== 'ALL' ? { product } : {}), ...(group ? { group } : {}), ...(dept ? { departmentId: dept } : {}), ...(q.trim() ? { q: q.trim() } : {}), page, pageSize };
  const list = useQuery({ queryKey: ['loans', params], queryFn: () => api.loans.list(params), placeholderData: keepPreviousData, refetchInterval: 5000 });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const data = list.data;
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const filtersOn = Boolean(q || dept || group !== 'IN_PROCESS' || product !== 'ALL');
  const clear = () =>
    reset(() => {
      setQ('');
      setDept('');
      setGroup('IN_PROCESS');
      setProduct('ALL');
    });

  const columns: ColumnDefinition<Row>[] = [
    {
      field: 'applicationNo',
      header: 'Application',
      minWidth: '170px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div>
          <p className="tabular text-label text-fg">{r.loanNo ?? r.applicationNo}</p>
          <p className="text-caption text-fg-tertiary">
            {r.productName}
            {r.isTopup ? ' · top-up' : ''}
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
      field: 'appliedAmount',
      header: 'Amount',
      minWidth: '140px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div>
          <Money value={r.sanctionedAmount ?? r.appliedAmount} className="text-body text-fg" />
          <p className="text-caption text-fg-tertiary">
            {r.instalments} mths{r.emi ? ' · EMI ' : ''}
            {r.emi ? <Money value={r.emi} /> : null}
          </p>
        </div>
      ),
    },
    {
      field: 'outstanding',
      header: 'Outstanding',
      minWidth: '130px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) =>
        r.group === 'ACTIVE' ? (
          <div>
            <Money value={r.outstanding} className="text-body" />
            {r.nextDue && <p className="text-caption text-fg-tertiary">next {formatCycle(r.nextDue.cycle)}</p>}
          </div>
        ) : (
          <span className="text-caption text-fg-tertiary">—</span>
        ),
    },
    {
      field: 'status',
      header: 'Stage',
      minWidth: '220px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusTag entity="loan" status={r.status} size={TagV2Size.XS} />
          {r.waitingOn && r.group === 'IN_PROCESS' && <span className="max-w-[220px] truncate text-caption text-fg-tertiary">{r.waitingOn}</span>}
        </div>
      ),
    },
    { field: 'appliedOn', header: 'Applied', minWidth: '120px', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="tabular text-caption text-fg-secondary">{formatDisplayDate(r.appliedOn)}</span> },
  ];

  const state = list.isLoading ? 'loading' : list.isError ? 'error' : !data?.counts.byProduct.ALL ? 'empty' : !data.total ? 'noResults' : 'ready';

  return (
    <>
      <PageHeader
        title="Loans"
        description={`Ordinary, Education, Salary and Deposit loans from application to disbursement${data?.scope.departmentName ? ` · ${data.scope.departmentName} department only` : ''}. Applications from the app appear here within a few seconds.`}
        meta={data?.counts.byGroup.IN_PROCESS ? <TagV2 text={`${data.counts.byGroup.IN_PROCESS} in process`} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
        actions={data?.canCreate ? <ButtonV2 text="New application" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => navigate('/loans/new')} /> : undefined}
      />

      <div className="mb-4 overflow-x-auto">
        <TabsV2 value={product} onValueChange={(v) => reset(() => setProduct(v as typeof product))}>
          <TabsV2List variant={TabsV2Variant.UNDERLINE}>
            {PRODUCT_TABS.map((t) => (
              <TabsV2Trigger key={t.value} value={t.value} variant={TabsV2Variant.UNDERLINE} rightSlot={<span className="tabular rounded-pill bg-surface-muted px-1.5 text-caption-strong text-fg-secondary">{data?.counts.byProduct[t.value] ?? 0}</span>}>
                {t.label}
              </TabsV2Trigger>
            ))}
          </TabsV2List>
        </TabsV2>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <SearchInputV2 value={q} placeholder="Member, General No., application or loan no." leftSlot={<Search size={16} />} onChange={(e) => reset(() => setQ(e.target.value))} />
        </div>
        <div className="w-52">
          <SingleSelectV2 placeholder="Every status" items={[{ items: GROUP_ITEMS.map((g) => ({ label: `${g.label}${g.value && data ? ` (${data.counts.byGroup[g.value] ?? 0})` : ''}`, value: g.value })) }]} selected={group} onSelect={(v) => reset(() => setGroup(v as LoanStatusGroup | ''))} />
        </div>
        {!data?.scope.departmentId && (
          <div className="w-60">
            <SingleSelectV2
              placeholder="All departments"
              items={[{ items: [{ label: 'All departments', value: '' }, ...(depts.data ?? []).map((d) => ({ label: d.name, value: d.id }))] }]}
              selected={dept}
              onSelect={(v) => reset(() => setDept(v))}
              search={{ show: true, placeholder: 'Search departments' }}
            />
          </div>
        )}
        {filtersOn && (
          <button type="button" className="text-caption text-link hover:underline" onClick={clear}>
            Clear filters
          </button>
        )}
        <span className="ml-auto text-caption text-fg-tertiary" aria-live="polite">
          {list.isFetching && !list.isLoading ? 'Updating…' : data ? `Live · ${data.total} found` : ''}
        </span>
      </div>

      <ViewState state={state} layout="table" onRetry={() => void list.refetch()} onClearFilters={clear} empty={{ icon: HandCoins, title: 'No loans yet', description: 'Applications from the Member App and the office appear here.' }}>
        <Table<Row>
          data={(data?.items ?? []) as Row[]}
          columns={columns}
          idField="id"
          isHoverable
          onRowClick={(r) => navigate(`/loans/${r.id}`)}
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
