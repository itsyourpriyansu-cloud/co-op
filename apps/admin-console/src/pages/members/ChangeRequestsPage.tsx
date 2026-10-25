// ST-18 Profile change requests from the Member App (MB-19, D-044, D-057). Employment and pay
// changes go to the member's DDO first; the Accountant then approves (writes the master and the
// service history) or rejects with a reason. The member sees the outcome in the app.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, FileClock, FileText, FlaskConical, Search } from 'lucide-react';
import {
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  ButtonV2,
  ButtonV2Type,
  SearchInputV2,
  SnackbarV2Variant,
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
} from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import type { ChangeRequestList, ChangeRequestRow } from '@tgs/types';
import { PageHeader } from '@/components/PageHeader';
import { SideDrawer } from '@/components/SideDrawer';
import { StatusTag } from '@/components/StatusTag';
import { ViewState } from '@/components/ViewState';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MembersTabs } from './MembersPage';
import { changeValue, fieldLabel } from './members';

type Filter = 'mine' | 'pending' | 'decided';

function RouteSteps({ r }: { r: ChangeRequestRow }) {
  const steps = [
    ...(r.route === 'DDO_THEN_OFFICE' ? [{ label: 'DDO certifies', done: Boolean(r.ddoCertified), by: r.ddoCertified ? `${r.ddoCertified.byName} · ${formatDisplayDateTime(r.ddoCertified.at)}` : undefined }] : []),
    { label: 'Accountant decides', done: r.status !== 'PENDING', by: r.decidedByName ? `${r.decidedByName}${r.decidedAt ? ` · ${formatDisplayDateTime(r.decidedAt)}` : ''}` : undefined },
  ];
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill text-caption-strong', s.done ? 'bg-success-bg text-success-fg' : 'bg-surface-muted text-fg-tertiary')}>{s.done ? <BadgeCheck size={14} aria-hidden /> : i + 1}</span>
          <div>
            <p className="text-label text-fg">{s.label}</p>
            <p className="text-caption text-fg-secondary">{s.by ?? 'Pending'}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionDrawer({ row, onClose }: { row: ChangeRequestRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const certifying = row?.myAction === 'certify' || Boolean(row?.demoCertifyAs);
  const act = useMutation({
    mutationFn: ({ approve }: { approve: boolean }) => (certifying ? api.changeRequests.certify(row!.id, approve, remarks.trim() || undefined) : api.changeRequests.decide(row!.id, approve, remarks.trim() || undefined)),
    onSuccess: (next, { approve }) => {
      qc.setQueryData<ChangeRequestList>(['change-requests'], (old) => (old ? { ...old, rows: old.rows.map((r) => (r.id === next.id ? next : r)) } : old));
      void qc.invalidateQueries({ queryKey: ['change-requests'] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: ['member', next.memberId] });
      const header = certifying ? (approve ? 'Certified. Sent to the Accountant' : 'Not certified. Member told why') : approve ? 'Approved. Profile updated' : 'Rejected. Member told why';
      addSnackbarV2({ header, description: `${next.memberName} · General No. ${next.generalNo}`, variant: approve ? SnackbarV2Variant.SUCCESS : SnackbarV2Variant.WARNING });
      close();
    },
  });
  const close = () => {
    setRemarks('');
    setRejecting(false);
    act.reset();
    onClose();
  };
  if (!row) return null;
  const canAct = Boolean(row.myAction || row.demoCertifyAs) && row.status === 'PENDING';
  const fieldError = isApiError(act.error) ? act.error.fieldErrors?.remarks : undefined;

  return (
    <SideDrawer
      open={Boolean(row)}
      onClose={close}
      title={certifying ? 'Certify employment / pay details' : row.status === 'PENDING' ? 'Profile change request' : 'Profile change (decided)'}
      description={`${row.memberName} · General No. ${row.generalNo} · ${row.departmentName}`}
      footer={
        canAct ? (
          rejecting ? (
            <div className="flex justify-end gap-2">
              <ButtonV2 text="Back" buttonType={ButtonV2Type.SECONDARY} onClick={() => setRejecting(false)} disabled={act.isPending} />
              <ButtonV2 text={certifying ? 'Do not certify' : 'Reject request'} buttonType={ButtonV2Type.DANGER} disabled={!remarks.trim()} loading={act.isPending} onClick={() => act.mutate({ approve: false })} />
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <ButtonV2 text={certifying ? 'Not correct' : 'Reject'} buttonType={ButtonV2Type.SECONDARY} onClick={() => setRejecting(true)} />
              <ButtonV2
                text={row.demoCertifyAs ? `Certify as ${row.demoCertifyAs.split(' (')[0]}` : certifying ? 'Certify' : 'Approve & update profile'}
                buttonType={ButtonV2Type.PRIMARY}
                {...(row.demoCertifyAs ? { leftSlot: { slot: <FlaskConical size={16} /> } } : {})}
                loading={act.isPending}
                onClick={() => act.mutate({ approve: true })}
              />
            </div>
          )
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {act.isError && !fieldError && <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Not saved" description={isApiError(act.error) ? act.error.message : 'Try again.'} />}
        <section className="overflow-hidden rounded-card border border-line">
          <div className="grid grid-cols-[1fr_1fr_1fr] bg-surface-subtle px-4 py-2 text-caption text-fg-tertiary">
            <span>Detail</span>
            <span>Now</span>
            <span>Requested</span>
          </div>
          <ul className="divide-y divide-line-subtle">
            {row.fields.map((f) => (
              <li key={f.field} className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-3 text-body">
                <span className="text-fg-secondary">{fieldLabel(f)}</span>
                <span className="text-fg-secondary line-through decoration-fg-tertiary">{changeValue(f, f.oldValue)}</span>
                <span className="font-medium text-fg">{changeValue(f, f.newValue)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Member's reason</h3>
          <p className="text-body text-fg">“{row.reason}”</p>
          <p className="text-caption text-fg-tertiary">Sent from the app · {formatDisplayDateTime(row.createdAt)}</p>
        </section>
        {row.documentName && (
          <div className="flex items-center gap-3 rounded-card border border-line px-4 py-3">
            <FileText size={20} className="shrink-0 text-brand-text" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-label text-fg">{row.documentName}</p>
              <p className="text-caption text-fg-tertiary">Supporting document (simulated, no preview)</p>
            </div>
          </div>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-overline uppercase tracking-wide text-fg-tertiary">Route</h3>
          <RouteSteps r={row} />
        </section>
        {row.remarks && <AlertV2 type={row.status === 'REJECTED' ? AlertV2Type.ERROR : AlertV2Type.NEUTRAL} subType={AlertV2SubType.SUBTLE} heading="Remarks" description={row.remarks} />}
        {canAct && !certifying && <p className="text-caption text-fg-secondary">Approving writes the new values to the member master, adds a service-history entry and tells the member in the app.</p>}
        {canAct && (rejecting || remarks) && (
          <TextAreaV2 label={rejecting ? 'Reason (the member sees this)' : 'Remarks'} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder={rejecting ? 'e.g. Send the service register extract' : 'Optional'} required={rejecting} error={fieldError ? { show: true, message: fieldError } : undefined} />
        )}
        {!canAct && row.status === 'PENDING' && row.waitingOn && <p className="text-body text-fg-secondary">Waiting on {row.waitingOn}.</p>}
        <Link to={`/members/${row.memberId}`} className="inline-flex items-center gap-1 text-caption text-link hover:underline">
          Open member profile <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </SideDrawer>
  );
}

export function ChangeRequestsPage() {
  const list = useQuery({ queryKey: ['change-requests'], queryFn: api.changeRequests.list, refetchInterval: 5000 });
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const data = list.data;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        (filter === 'mine' ? Boolean(r.myAction || r.demoCertifyAs) && r.status === 'PENDING' : filter === 'pending' ? r.status === 'PENDING' : r.status !== 'PENDING') &&
        (!needle || r.memberName.toLowerCase().includes(needle) || r.generalNo.includes(needle)),
    );
  }, [data, filter, q]);
  const open = data?.rows.find((r) => r.id === openId) ?? null;
  const state = list.isLoading ? 'loading' : list.isError ? 'error' : !data?.rows.length ? 'empty' : !rows.length ? 'noResults' : 'ready';

  return (
    <>
      <PageHeader
        title="Members"
        description="Profile changes members asked for in the app. Employment and pay details are certified by the member's DDO before the Accountant decides."
        meta={data && data.counts.waitingOnMe > 0 ? <TagV2 text={`${data.counts.waitingOnMe} waiting on you`} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} /> : undefined}
      />
      <div className="mb-5">
        <MembersTabs requests={data?.counts.pending} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TabsV2 value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsV2List variant={TabsV2Variant.BOXED}>
            <TabsV2Trigger value="mine" variant={TabsV2Variant.BOXED}>
              {`Waiting on me (${data?.counts.waitingOnMe ?? 0})`}
            </TabsV2Trigger>
            <TabsV2Trigger value="pending" variant={TabsV2Variant.BOXED}>
              {`All pending (${data?.counts.pending ?? 0})`}
            </TabsV2Trigger>
            <TabsV2Trigger value="decided" variant={TabsV2Variant.BOXED}>
              Decided
            </TabsV2Trigger>
          </TabsV2List>
        </TabsV2>
        <div className="w-full max-w-xs">
          <SearchInputV2 value={q} placeholder="Search member or General No." leftSlot={<Search size={16} />} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="ml-auto text-caption text-fg-tertiary" aria-live="polite">
          Live · {rows.length} shown
        </span>
      </div>

      <ViewState
        state={state}
        layout="cards"
        onRetry={() => void list.refetch()}
        onClearFilters={() => {
          setQ('');
          setFilter('pending');
        }}
        empty={{ icon: FileClock, title: 'No change requests', description: 'When a member asks to correct their details in the app, it appears here.' }}
      >
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className={cn('flex w-full flex-col gap-3 rounded-card border bg-surface p-4 text-left shadow-flat transition-shadow hover:shadow-hover focus-visible:outline-2 focus-visible:outline-focus', r.myAction ? 'border-brand-border ring-1 ring-brand-border' : 'border-line')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-label text-fg">{r.memberName}</p>
                    <p className="tabular truncate text-caption text-fg-tertiary">
                      No. {r.generalNo} · {r.departmentName}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.myAction && <TagV2 text={r.myAction === 'certify' ? 'Certify' : 'Decide'} size={TagV2Size.XS} color={TagV2Color.PRIMARY} type={TagV2Type.ATTENTIVE} subType={TagV2SubType.ROUNDED} />}
                    <StatusTag entity="changeRequest" status={r.status} size={TagV2Size.XS} />
                  </div>
                </div>
                <ul className="flex flex-col gap-1 text-body">
                  {r.fields.map((f) => (
                    <li key={f.field} className="truncate text-fg-secondary">
                      {fieldLabel(f)}: <span className="line-through">{changeValue(f, f.oldValue)}</span> → <span className="text-fg">{changeValue(f, f.newValue)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-line-subtle pt-2.5 text-caption text-fg-tertiary">
                  <span>{r.route === 'DDO_THEN_OFFICE' ? (r.ddoCertified ? 'DDO certified' : 'Needs the DDO first') : 'Office only'}</span>
                  <span>{r.status === 'PENDING' ? (r.waitingOn ? `Waiting on ${r.waitingOn}` : '') : formatDisplayDateTime(r.decidedAt ?? r.createdAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </ViewState>
      <DecisionDrawer row={open} onClose={() => setOpenId(null)} />
    </>
  );
}
