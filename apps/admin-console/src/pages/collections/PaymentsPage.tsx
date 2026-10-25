// ST-44 Payments / receipts index (+ "Reported by members" tab) and ST-47 verify-reported-payment
// drawer (D-043): match the bank reference → Verify (receipt with the BR-011 allocation) or Reject.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarDays, Image, Inbox, Plus, Search } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Size,
  ButtonV2Type,
  Checkbox,
  CheckboxSize,
  ColumnType,
  SearchInputV2,
  SnackbarV2Variant,
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
  TextAreaV2,
  addSnackbarV2,
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { allocateArrears, formatDisplayDate, formatDisplayDateTime, formatINR, formatINRCompact } from '@tgs/domain';
import type { PaymentReportRow, ReceiptRow, ReceiptTab } from '@tgs/types';
import { useDebounced } from '@/components/MemberSearch';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { SideDrawer } from '@/components/SideDrawer';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { HEAD_LABEL, PURPOSE_LABEL, REPORT_MODE_LABEL, SOURCE_LABEL, cycleLabel } from './collections';

type Row = ReceiptRow & Record<string, unknown>;

function VerifyDrawer({ report, onClose }: { report: PaymentReportRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const dues = useQuery({ queryKey: ['dues', report?.memberId], queryFn: () => api.receipts.dues(report!.memberId), enabled: Boolean(report) });
  const [matched, setMatched] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    setMatched(false);
    setRejecting(false);
    setReason('');
  }, [report?.id]);
  const preview = useMemo(() => {
    if (!dues.data || !report || report.towards === 'SHARE_CAPITAL') return undefined;
    const r = allocateArrears(dues.data.arrears.map((a) => ({ key: a.cycle, components: a.components })), report.amount);
    return r.cycles.flatMap((c, i) => c.components.map((x, j) => ({ cycle: c.key, label: dues.data!.arrears[i]!.components[j]!.label, delta: x.allocated - dues.data!.arrears[i]!.components[j]!.allocated }))).filter((x) => x.delta > 0);
  }, [dues.data, report]);
  const done = (header: string) => {
    void qc.invalidateQueries({ queryKey: ['payment-reports'] });
    void qc.invalidateQueries({ queryKey: ['receipts'] });
    void qc.invalidateQueries({ queryKey: ['work-queue'] });
    addSnackbarV2({ header, description: `${report?.memberName} · ${formatINR(report?.amount ?? 0)}`, variant: SnackbarV2Variant.SUCCESS });
  };
  // Verify opens the new receipt (the drawer goes with the page); reject stays on the list.
  const verify = useMutation({ mutationFn: () => api.receipts.verify(report!.id), onSuccess: (r) => { done(`Verified · receipt ${r.receipt.receiptNo}`); navigate(`/payments/${r.receipt.id}`); } });
  const reject = useMutation({ mutationFn: () => api.receipts.reject(report!.id, reason.trim()), onSuccess: () => { done('Rejected · member notified'); onClose(); } });
  const err = verify.error ?? reject.error;
  if (!report) return null;
  return (
    <SideDrawer
      open={Boolean(report)}
      onClose={onClose}
      title="Verify reported payment"
      description="Find the credit in the bank statement, then verify to create the receipt, or reject with a reason the member sees."
      footer={
        <div className="flex justify-end gap-2">
          {rejecting ? (
            <>
              <ButtonV2 text="Back" buttonType={ButtonV2Type.SECONDARY} onClick={() => setRejecting(false)} />
              <ButtonV2 text="Reject payment" buttonType={ButtonV2Type.DANGER} disabled={reason.trim().length < 10} loading={reject.isPending} onClick={() => reject.mutate()} />
            </>
          ) : (
            <>
              <ButtonV2 text="Reject" buttonType={ButtonV2Type.SECONDARY} onClick={() => setRejecting(true)} />
              <ButtonV2 text="Verify & create receipt" disabled={!matched} loading={verify.isPending} onClick={() => verify.mutate()} />
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-card border border-line bg-surface-subtle px-4 py-3">
          <p className="text-label text-fg">{report.memberName}</p>
          <p className="text-caption text-fg-secondary">
            No. {report.generalNo} · {report.departmentName}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-caption text-fg-tertiary">Amount</dt>
            <dd className="text-metric-sm text-fg">
              <Money value={report.amount} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">Paid on</dt>
            <dd className="text-body text-fg">{formatDisplayDate(report.paidOn)}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">Mode</dt>
            <dd className="text-body text-fg">{REPORT_MODE_LABEL[report.mode]}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">Reference</dt>
            <dd className="font-mono text-body text-fg">{report.reference}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">Towards</dt>
            <dd className="text-body text-fg">{report.towards === 'SHARE_CAPITAL' ? 'Share capital' : 'Dues'}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-tertiary">Reported</dt>
            <dd className="text-body text-fg">{report.reportedAt ? formatDisplayDateTime(report.reportedAt) : '—'}</dd>
          </div>
        </dl>
        {report.screenshotName && (
          <div className="flex items-center gap-3 rounded-card border border-dashed border-line px-4 py-3">
            <Image size={18} className="text-fg-tertiary" aria-hidden />
            <span className="text-caption text-fg-secondary">{report.screenshotName} · screenshot attached (preview simulated)</span>
          </div>
        )}
        {dues.data && (
          <section className="flex flex-col gap-2">
            <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Applied to (BR-011, oldest month first)</h3>
            {report.towards === 'SHARE_CAPITAL' ? (
              <p className="text-body text-fg">Share capital · {formatINR(report.amount)} of {formatINR(dues.data.shareCapitalDue)} due</p>
            ) : (
              <ul className="divide-y divide-line-subtle rounded-card border border-line">
                {(preview ?? []).map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-caption">
                    <span className="text-fg">
                      {cycleLabel(p.cycle)} · {p.label}
                    </span>
                    <span className="tabular text-fg">{formatINR(p.delta)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-fg-tertiary">Dues before: {formatINR(dues.data.totalArrears)} · after: {formatINR(Math.max(0, dues.data.totalArrears - (report.towards === 'SHARE_CAPITAL' ? 0 : report.amount)))}</p>
          </section>
        )}
        {rejecting ? (
          <TextAreaV2 label="Reason" placeholder="e.g. No matching credit found in the bank statement." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required hintText="The member sees this in the app. At least 10 characters." />
        ) : (
          <Checkbox checked={matched} onCheckedChange={(v) => setMatched(v === true)} size={CheckboxSize.MEDIUM} subtext={`Reference ${report.reference} for ${formatINR(report.amount)} on ${formatDisplayDate(report.paidOn)}`}>
            I found this credit in the society's bank statement
          </Checkbox>
        )}
        {err && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Couldn't save" description={isApiError(err) ? err.message : 'Try again.'} />}
      </div>
    </SideDrawer>
  );
}

export function PaymentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as ReceiptTab | null) ?? (params.get('report') ? 'REPORTED' : 'ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  useEffect(() => setPage(1), [dq, tab]);
  // Runs on every tab: the totals cards and counts come from it.
  const listTab = tab === 'REPORTED' ? 'ALL' : tab;
  const list = useQuery({ queryKey: ['receipts', listTab, dq, page], queryFn: () => api.receipts.list({ tab: listTab, ...(dq ? { q: dq } : {}), page, pageSize: 25 }), placeholderData: keepPreviousData, refetchInterval: 15_000 });
  const reports = useQuery({ queryKey: ['payment-reports'], queryFn: () => api.receipts.reports(), refetchInterval: 10_000 });
  const openReport = (reports.data ?? []).find((r) => r.id === params.get('report')) ?? null;
  const counts = list.data?.counts;
  const reportedOpen = (reports.data ?? []).filter((r) => r.status === 'REPORTED').length;

  const columns: ColumnDefinition<Row>[] = [
    { field: 'receiptNo', header: 'Receipt', type: ColumnType.REACT_ELEMENT, isSortable: false, minWidth: '190px', renderCell: (_v, r) => (
      <div>
        <p className="tabular text-label text-fg">{r.receiptNo}</p>
        <p className="tabular text-caption text-fg-tertiary">{formatDisplayDate(r.date)}</p>
      </div>
    ) },
    { field: 'memberName', header: 'Member', type: ColumnType.REACT_ELEMENT, isSortable: false, minWidth: '220px', renderCell: (_v, r) => (
      <div>
        <p className="text-label text-fg">{r.memberName}</p>
        <p className="text-caption text-fg-tertiary">
          No. {r.generalNo} · {r.departmentName}
        </p>
      </div>
    ) },
    { field: 'source', header: 'Source', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="text-body text-fg">{SOURCE_LABEL[r.source]}{r.purpose ? <span className="text-caption text-fg-tertiary"> · {PURPOSE_LABEL[r.purpose]}</span> : r.cycle ? <span className="text-caption text-fg-tertiary"> · {cycleLabel(r.cycle)}</span> : null}</span> },
    { field: 'heads', header: 'Allocated to', type: ColumnType.REACT_ELEMENT, isSortable: false, minWidth: '220px', renderCell: (_v, r) => (
      <div className="flex flex-wrap gap-1">
        {r.heads.slice(0, 4).map((h) => (
          <TagV2 key={h} text={HEAD_LABEL[h]} size={TagV2Size.XS} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
        ))}
        {r.heads.length > 4 && <span className="text-caption text-fg-tertiary">+{r.heads.length - 4}</span>}
        {!r.heads.length && <span className="text-caption text-fg-tertiary">—</span>}
      </div>
    ) },
    { field: 'amount', header: 'Amount', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <Money value={r.amount} className="text-label text-fg" /> },
    { field: 'byName', header: 'Posted by', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="text-caption text-fg-secondary">{r.byName ?? 'Salary recovery'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every receipt: salary recoveries posted from demand sheets, counter and bank receipts, and payments members report from the app."
        meta={reportedOpen ? <TagV2 text={`${reportedOpen} to verify`} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
        actions={list.data?.canReceive ? <ButtonV2 text="New receipt" leftSlot={{ slot: <Plus size={16} /> }} onClick={() => navigate('/payments/new')} /> : undefined}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCardV2 title="Received today" value={formatINRCompact(list.data?.totals.today ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<Banknote size={16} />} subtitle="Counter, bank and salary" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="This month" value={formatINRCompact(list.data?.totals.thisMonth ?? 0)} variant={StatCardV2Variant.NUMBER} titleIcon={<CalendarDays size={16} />} subtitle="All receipts" skeleton={{ show: list.isLoading, variant: 'pulse' }} />
        <StatCardV2 title="Reported by members" value={String(reportedOpen)} variant={StatCardV2Variant.NUMBER} titleIcon={<Inbox size={16} />} subtitle="Waiting for the cashier to verify" skeleton={{ show: reports.isLoading, variant: 'pulse' }} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <TabsV2 value={tab} onValueChange={(v) => setParams({ tab: v })}>
          <TabsV2List variant={TabsV2Variant.UNDERLINE}>
            {(
              [
                ['ALL', 'All receipts', counts?.ALL],
                ['SALARY_RECOVERY', 'Salary recovery', counts?.SALARY_RECOVERY],
                ['COUNTER', 'Counter & bank', counts?.COUNTER],
                ['REPORTED', 'Reported by members', reportedOpen],
              ] as const
            ).map(([v, label, n]) => (
              <TabsV2Trigger key={v} value={v} variant={TabsV2Variant.UNDERLINE}>
                {n !== undefined ? `${label} (${n.toLocaleString('en-IN')})` : label}
              </TabsV2Trigger>
            ))}
          </TabsV2List>
        </TabsV2>
        {tab !== 'REPORTED' && (
          <div className="w-full max-w-sm">
            <SearchInputV2 value={q} placeholder="Receipt no., member, General No. or reference" leftSlot={<Search size={16} />} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      </div>

      {tab === 'REPORTED' ? (
        <ViewState state={reports.isLoading ? 'loading' : reports.isError ? 'error' : !(reports.data ?? []).length ? 'empty' : 'ready'} layout="table" onRetry={() => void reports.refetch()} empty={{ icon: Inbox, title: 'No reported payments', description: 'When members report a bank or UPI payment in the app, it appears here to verify.' }}>
          <ul className="divide-y divide-line-subtle rounded-card border border-line bg-surface shadow-raised">
            {(reports.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-label text-fg">{r.memberName}</p>
                  <p className="text-caption text-fg-tertiary">
                    No. {r.generalNo} · {r.departmentName} · {REPORT_MODE_LABEL[r.mode]} <span className="font-mono">{r.reference}</span> · paid {formatDisplayDate(r.paidOn)}
                  </p>
                  {r.status === 'REJECTED' && r.rejectReason && <p className="text-caption text-danger-fg">{r.rejectReason}</p>}
                </div>
                <Money value={r.amount} className="text-label text-fg" />
                <StatusTag entity="paymentReport" status={r.status} />
                {r.status === 'REPORTED' && list.data?.canReceive !== false ? <ButtonV2 text="Verify" size={ButtonV2Size.SMALL} onClick={() => setParams({ tab: 'REPORTED', report: r.id })} /> : <span className="w-[68px]" />}
              </li>
            ))}
          </ul>
        </ViewState>
      ) : (
        <ViewState state={list.isLoading ? 'loading' : list.isError ? 'error' : !list.data?.items.length ? (dq ? 'noResults' : 'empty') : 'ready'} layout="table" onRetry={() => void list.refetch()} onClearFilters={() => setQ('')} empty={{ icon: Banknote, title: 'No receipts yet' }}>
          {list.data && (
            <Table<Row>
              data={list.data.items as Row[]}
              columns={columns}
              idField="id"
              isHoverable
              showToolbar={false}
              onRowClick={(r) => navigate(`/payments/${r.id}`)}
              pagination={{ currentPage: list.data.page, pageSize: list.data.pageSize, totalRows: list.data.total, pageSizeOptions: [25] }}
              serverSidePagination
              onPageChange={setPage}
            />
          )}
        </ViewState>
      )}
      <VerifyDrawer report={openReport} onClose={() => setParams({ tab: 'REPORTED' })} />
    </>
  );
}
