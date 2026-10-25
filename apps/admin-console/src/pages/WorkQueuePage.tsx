// ST-02 Work Queue: everything waiting on the signed-in user, oldest first — loan stages, joining
// applications, profile change requests and (for DDOs) mandates to agree. DDOs see their department.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { ColumnType, TabsV2, TabsV2List, TabsV2Trigger, TabsV2Variant, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, type ColumnDefinition } from '@juspay/blend-design-system';
import { formatDisplayDate } from '@tgs/domain';
import type { AnyStatus, WorkItem } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { Table } from '@/components/Table';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Row = WorkItem & Record<string, unknown>;

/** Waiting since: amber after 3 days, red after 7 [P] (docs/06 ST-02). */
function Age({ days }: { days: number }) {
  const tone = days > 7 ? 'bg-danger-bg text-danger-fg' : days > 3 ? 'bg-warning-bg text-warning-fg' : 'bg-surface-muted text-fg-secondary';
  return <span className={cn('tabular whitespace-nowrap rounded-pill px-2 py-0.5 text-caption-strong', tone)}>{days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`}</span>;
}

const KIND_ENTITY = { loan: 'loan', membership: 'membership' } as const;

export function WorkQueuePage() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['work-queue'], queryFn: api.workQueue, refetchInterval: 5000 });
  // ?tab= comes from the dashboard's stage links (ST-01).
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'ALL');
  const data = q.data;
  const rows = useMemo(() => (data?.items ?? []).filter((i) => tab === 'ALL' || i.stage === tab), [data, tab]);

  const columns: ColumnDefinition<Row>[] = [
    {
      field: 'title',
      header: 'Item',
      minWidth: '240px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="min-w-0">
          <p className="truncate text-label text-fg">{r.title}</p>
          <p className="truncate text-caption text-fg-tertiary">
            {r.ref} · {r.subtitle}
          </p>
        </div>
      ),
    },
    { field: 'departmentName', header: 'Department', minWidth: '170px', maxWidth: '220px', type: ColumnType.TEXT },
    { field: 'amount', header: 'Amount', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => (r.amount ? <Money value={r.amount} className="text-body" /> : <span className="text-caption text-fg-tertiary">—</span>) },
    {
      field: 'stage',
      header: 'Stage',
      minWidth: '190px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) =>
        r.status && (r.kind === 'loan' || r.kind === 'membership') ? (
          <StatusTag entity={KIND_ENTITY[r.kind]} status={r.status as AnyStatus} size={TagV2Size.XS} />
        ) : (
          <TagV2 text={r.stageLabel} size={TagV2Size.XS} color={TagV2Color.NEUTRAL} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
        ),
    },
    {
      field: 'days',
      header: 'Waiting since',
      minWidth: '140px',
      type: ColumnType.REACT_ELEMENT,
      isSortable: false,
      renderCell: (_v, r) => (
        <div className="flex flex-col items-start gap-0.5">
          <Age days={r.days} />
          <span className="text-caption text-fg-tertiary">{formatDisplayDate(r.since)}</span>
        </div>
      ),
    },
    { field: 'actionLabel', header: '', width: '120px', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <span className="text-label text-link">{r.actionLabel} →</span> },
  ];

  return (
    <>
      <PageHeader
        title="Work Queue"
        description={`Everything waiting for your review, certificate, signature or payout, oldest first${data?.scope.departmentName ? ` · ${data.scope.departmentName} department only` : ''}.`}
        meta={data ? <TagV2 text={`${data.items.length} waiting`} color={data.items.length ? TagV2Color.WARNING : TagV2Color.SUCCESS} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
      />
      {data && data.tabs.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <TabsV2 value={tab} onValueChange={setTab}>
            <TabsV2List variant={TabsV2Variant.UNDERLINE}>
              <TabsV2Trigger value="ALL" variant={TabsV2Variant.UNDERLINE} rightSlot={<span className="tabular rounded-pill bg-surface-muted px-1.5 text-caption-strong text-fg-secondary">{data.items.length}</span>}>
                All
              </TabsV2Trigger>
              {data.tabs.map((t) => (
                <TabsV2Trigger key={t.key} value={t.key} variant={TabsV2Variant.UNDERLINE} rightSlot={<span className="tabular rounded-pill bg-surface-muted px-1.5 text-caption-strong text-fg-secondary">{t.count}</span>}>
                  {t.label}
                </TabsV2Trigger>
              ))}
            </TabsV2List>
          </TabsV2>
        </div>
      )}
      <ViewState
        state={q.isLoading ? 'loading' : q.isError ? 'error' : !data?.items.length ? 'empty' : 'ready'}
        layout="table"
        onRetry={() => void q.refetch()}
        empty={{ icon: Inbox, title: 'Nothing waiting on you', description: 'New applications, certificates and signatures appear here as soon as they reach your stage.' }}
      >
        <Table<Row> data={rows as Row[]} columns={columns} idField="id" isHoverable onRowClick={(r) => navigate(r.link)} showToolbar={false} />
      </ViewState>
    </>
  );
}
