// ST-10 Member Index: the member master, searchable and filterable on the server (605 members).
// DDOs see only their department. Row → ST-12 profile. "Change requests" is the ST-18 tab.
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileClock, Hourglass, Search, ShieldAlert, UserPlus, Users } from 'lucide-react';
import {
  ButtonV2,
  ButtonV2Type,
  Checkbox,
  CheckboxSize,
  ColumnType,
  SearchInputV2,
  SingleSelectV2,
  SnackbarV2Variant,
  StatCardV2,
  StatCardV2Variant,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  addSnackbarV2,
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { formatDisplayDate, formatDuration, formatINR } from '@tgs/domain';
import type { MemberListParams, MemberRow, MemberStatus } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { retiringLabel } from './members';

type Row = MemberRow & Record<string, unknown>;

/** Members ↔ Change requests switch, shared by ST-10 and ST-18. */
export function MembersTabs({ requests }: { requests?: number }) {
  const link = ({ isActive }: { isActive: boolean }) => cn('inline-flex items-center gap-2 rounded-control px-3 py-1.5 text-label transition-colors', isActive ? 'bg-surface text-fg shadow-flat' : 'text-fg-secondary hover:text-fg');
  return (
    <nav aria-label="Members sections" className="inline-flex rounded-control bg-surface-muted p-1">
      <NavLink to="/members" end className={link}>
        <Users size={16} aria-hidden /> Members
      </NavLink>
      <NavLink to="/members/change-requests" className={link}>
        <FileClock size={16} aria-hidden /> Change requests
        {requests ? <span className="tabular rounded-pill bg-warning-bg px-1.5 text-caption-strong text-warning-fg">{requests}</span> : null}
      </NavLink>
    </nav>
  );
}

const STATUS_ITEMS = [
  { label: 'Active members', value: 'ACTIVE' },
  { label: 'Retired', value: 'RETIRED' },
  { label: 'Resigned', value: 'RESIGNED' },
  { label: 'Deceased', value: 'DECEASED' },
  { label: 'Everyone', value: 'ALL' },
];
const RETIRING_ITEMS = [
  { label: 'Any retirement date', value: '' },
  { label: 'Retiring within 3 months', value: '3' },
  { label: 'Retiring within 6 months', value: '6' },
  { label: 'Retiring within 12 months', value: '12' },
];

function toCsv(rows: MemberRow[]) {
  const head = ['General No.', 'Name', 'Employee ID', 'Department', 'Designation', 'Mobile', 'Date of retirement', 'Left-over service', 'Shares', 'Active loans', 'Outstanding', 'Status'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.generalNo, r.name, r.employeeId, r.departmentName, r.designation, r.mobileMasked, formatDisplayDate(r.dor), formatDuration(r.leftoverMonths), r.numberOfShares, r.activeLoans, formatINR(r.outstanding), r.status].map(esc).join(','));
  return [head.map(esc).join(','), ...lines].join('\n');
}

export function MembersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<MemberStatus | 'ALL'>('ACTIVE');
  const [dept, setDept] = useState('');
  const [retiring, setRetiring] = useState('');
  const [loanOnly, setLoanOnly] = useState(false);
  const [mandateOnly, setMandateOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);

  const params: MemberListParams = { q: q.trim() || undefined, status, departmentId: dept || undefined, retiringWithinMonths: retiring ? Number(retiring) : undefined, hasActiveLoan: loanOnly, mandatePending: mandateOnly, page, pageSize };
  const list = useQuery({ queryKey: ['members', params], queryFn: () => api.members.list(params), placeholderData: keepPreviousData });
  const depts = useQuery({ queryKey: ['departments'], queryFn: api.settings.departments, staleTime: 5 * 60_000 });
  const data = list.data;

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const filtersOn = Boolean(q || dept || retiring || loanOnly || mandateOnly || status !== 'ACTIVE');
  const clear = () =>
    reset(() => {
      setQ('');
      setDept('');
      setRetiring('');
      setLoanOnly(false);
      setMandateOnly(false);
      setStatus('ACTIVE');
    });

  // Prototype export: builds the CSV in the browser from every matching row (masked mobiles).
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: MemberRow[] = [];
      for (let p = 1; ; p++) {
        const res = await api.members.list({ ...params, page: p, pageSize: 100 });
        all.push(...res.items);
        if (all.length >= res.total || !res.items.length) break;
      }
      const url = URL.createObjectURL(new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `members-${data?.asOf ?? 'export'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      addSnackbarV2({ header: 'Export ready', description: `${all.length} members`, variant: SnackbarV2Variant.SUCCESS });
    } catch {
      addSnackbarV2({ header: "Couldn't export", description: 'Try again.', variant: SnackbarV2Variant.ERROR });
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnDefinition<Row>[] = [
    {
      field: 'name',
      header: 'Member',
      minWidth: '220px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="min-w-0">
          <p className="truncate text-label text-fg">{r.name}</p>
          <p className="tabular text-caption text-fg-tertiary">
            No. {r.generalNo} · {r.employeeId}
          </p>
        </div>
      ),
    },
    {
      field: 'departmentName',
      header: 'Department',
      minWidth: '200px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="min-w-0">
          <p className="truncate text-body text-fg">{r.departmentName}</p>
          <p className="truncate text-caption text-fg-tertiary">{r.designation}</p>
        </div>
      ),
    },
    { field: 'mobileMasked', header: 'Mobile', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="tabular text-caption text-fg-secondary">{r.mobileMasked}</span> },
    {
      field: 'dor',
      header: 'Retires',
      minWidth: '150px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => {
        const soon = retiringLabel(r.leftoverMonths, r.status);
        return (
          <div>
            <p className="tabular text-body text-fg">{formatDisplayDate(r.dor)}</p>
            <p className={cn('text-caption', soon && r.leftoverMonths <= 6 ? 'text-warning-fg' : 'text-fg-tertiary')}>{r.status === 'ACTIVE' ? `${formatDuration(r.leftoverMonths)} left` : '—'}</p>
          </div>
        );
      },
    },
    { field: 'numberOfShares', header: 'Shares', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="tabular text-body">{r.numberOfShares}</span> },
    {
      field: 'outstanding',
      header: 'Loans',
      minWidth: '130px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) =>
        r.activeLoans ? (
          <div>
            <Money value={r.outstanding} className="text-body text-fg" />
            <p className="text-caption text-fg-tertiary">{r.activeLoans} active</p>
          </div>
        ) : (
          <span className="text-caption text-fg-tertiary">Non-loanee</span>
        ),
    },
    {
      field: 'status',
      header: 'Status',
      minWidth: '150px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusTag entity="member" status={r.status} size={TagV2Size.XS} />
          {r.mandateStatus === 'PENDING_NEW_DDO' && <TagV2 text="Mandate pending" size={TagV2Size.XS} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
          {r.pendingChanges > 0 && <TagV2 text="Change requested" size={TagV2Size.XS} color={TagV2Color.PRIMARY} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />}
        </div>
      ),
    },
  ];

  const state = list.isLoading ? 'loading' : list.isError ? 'error' : !data?.counts.all ? 'empty' : !data.total ? 'noResults' : 'ready';

  return (
    <>
      <PageHeader
        title="Members"
        description={`The member master${data?.scope.departmentName ? ` · ${data.scope.departmentName} department only` : ''}. Open a member for their profile, service history, loans and transfers.`}
        actions={
          <>
            <ButtonV2 text="Export CSV" buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Download size={16} /> }} loading={exporting} disabled={!data?.total} onClick={() => void exportCsv()} />
            {data?.canCreate && <ButtonV2 text="New member" leftSlot={{ slot: <UserPlus size={16} /> }} onClick={() => navigate('/members/new')} />}
          </>
        }
      />
      <div className="mb-5">
        <MembersTabs requests={data?.counts.changeRequests} />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardV2 title="Active members" value={(data?.counts.active ?? 0).toLocaleString('en-IN')} variant={StatCardV2Variant.NUMBER} titleIcon={<Users size={16} />} subtitle={`${(data?.counts.all ?? 0).toLocaleString('en-IN')} on the register`} skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Retiring in 6 months" value={String(data?.counts.retiringSoon ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<Hourglass size={16} />} subtitle="Check loan tenures and dues" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Mandate pending" value={String(data?.counts.mandatePending ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<ShieldAlert size={16} />} subtitle="New DDO yet to agree (BR-028)" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Change requests" value={String(data?.counts.changeRequests ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<FileClock size={16} />} subtitle="Profile changes from the app" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <SearchInputV2 value={q} placeholder="Search name, General No. or Employee ID" leftSlot={<Search size={16} />} onChange={(e) => reset(() => setQ(e.target.value))} />
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
        <div className="w-48">
          <SingleSelectV2 placeholder="Status" items={[{ items: STATUS_ITEMS }]} selected={status} onSelect={(v) => reset(() => setStatus(v as MemberStatus | 'ALL'))} />
        </div>
        <div className="w-56">
          <SingleSelectV2 placeholder="Any retirement date" items={[{ items: RETIRING_ITEMS }]} selected={retiring} onSelect={(v) => reset(() => setRetiring(v))} />
        </div>
        <Checkbox checked={loanOnly} onCheckedChange={(v) => reset(() => setLoanOnly(v === true))} size={CheckboxSize.MEDIUM}>
          Has an active loan
        </Checkbox>
        <Checkbox checked={mandateOnly} onCheckedChange={(v) => reset(() => setMandateOnly(v === true))} size={CheckboxSize.MEDIUM}>
          Mandate pending
        </Checkbox>
        {filtersOn && (
          <button type="button" className="text-caption text-link hover:underline" onClick={clear}>
            Clear filters
          </button>
        )}
        <span className="ml-auto text-caption text-fg-tertiary" aria-live="polite">
          {list.isFetching && !list.isLoading ? 'Updating…' : data ? `${data.total.toLocaleString('en-IN')} found` : ''}
        </span>
      </div>

      <ViewState state={state} layout="table" onRetry={() => void list.refetch()} onClearFilters={clear} empty={{ icon: Users, title: 'No members yet', description: 'Add a member, or approve a joining application to create one.' }}>
        <Table<Row>
          data={(data?.items ?? []) as Row[]}
          columns={columns}
          idField="id"
          isHoverable
          onRowClick={(r) => navigate(`/members/${r.id}`)}
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
