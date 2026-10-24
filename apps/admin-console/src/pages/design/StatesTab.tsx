// State Explorer (docs/19 §3): render any page pattern in any of the ten ViewStates.
// Deep link: /design?tab=states&pattern=list&state=error
import { FileSpreadsheet, HandCoins, Inbox, LayoutDashboard, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import {
  ButtonV2,
  ButtonV2Size,
  ButtonV2Type,
  CardV2,
  CardV2Variant,
  ColumnType,
  KeyValuePairV2,
  StatCardV2,
  StatCardV2Variant,
  StepperV2,
  StepperV2StepStatus,
  TextInputV2,
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { formatDisplayDate } from '@tgs/domain';
import { VIEW_STATES, type LoanStatus, type ViewState as ViewStateName } from '@tgs/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { StatusTag } from '@/components/StatusTag';
import { ViewState, type SkeletonLayout } from '@/components/ViewState';
import { api } from '@/lib/api';
import { Table } from '@/components/Table';

const PATTERNS = {
  list: { label: 'List page', layout: 'table', title: 'Loans', icon: HandCoins, empty: { title: 'No loans yet', description: 'Applications from members and staff will appear here.', action: 'New application' } },
  detail: { label: 'Detail page', layout: 'detail', title: 'APP-2026-00412', icon: Inbox, empty: { title: 'This record has no activity yet', description: 'Events appear as the application moves through each stage.', action: 'Refresh' } },
  form: { label: 'Form', layout: 'form', title: 'New membership application', icon: UserPlus, empty: { title: 'No draft yet', description: 'Start an application to save a draft.', action: 'Start application' } },
  dashboard: { label: 'Dashboard', layout: 'stats', title: 'Dashboard', icon: LayoutDashboard, empty: { title: 'No data for this cycle', description: 'Generate the demand sheet to see collections.', action: 'Generate demand sheet' } },
} as const satisfies Record<string, { label: string; layout: SkeletonLayout; title: string; icon: typeof FileSpreadsheet; empty: { title: string; description: string; action: string } }>;

type PatternKey = keyof typeof PATTERNS;

const STATE_HELP: Record<ViewStateName, string> = {
  loading: 'First load: skeleton matching the layout. Never a blank page.',
  empty: 'Nothing exists yet: explain and offer the next step.',
  noResults: 'Filters hide everything: offer to clear them.',
  error: 'Request failed: plain apology, data is safe, retry.',
  offline: 'Server unreachable: keep input, retry.',
  noAccess: 'Role lacks permission: explain who can help.',
  ready: 'Normal content.',
  partial: 'Some parts failed: show what we have plus a warning.',
  submitting: 'Action in flight: dim content, block double submit.',
  success: 'Action done: confirm inline, then continue.',
};

type LoanRow = { id: string; applicationNo: string; member: string; product: string; status: string; amount: number; appliedOn: string };

function ReadyContent({ pattern }: { pattern: PatternKey }) {
  const sample = useQuery({ queryKey: ['dataset-sample'], queryFn: api.demo.sample });
  if (pattern === 'list') {
    const rows: LoanRow[] = (sample.data?.loans ?? []).map((l) => ({ id: l.id, applicationNo: l.applicationNo, member: `${l.member} · ${l.generalNo}`, product: l.product, status: l.status, amount: l.amount, appliedOn: formatDisplayDate(l.appliedOn) }));
    const columns: ColumnDefinition<LoanRow>[] = [
      { field: 'applicationNo', header: 'Application', type: ColumnType.TEXT },
      { field: 'member', header: 'Member', type: ColumnType.TEXT },
      { field: 'product', header: 'Type', type: ColumnType.TEXT },
      { field: 'status', header: 'Stage', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <StatusTag entity="loan" status={r.status as LoanStatus} /> },
      { field: 'amount', header: 'Amount', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, r) => <Money value={r.amount} /> },
      { field: 'appliedOn', header: 'Applied', type: ColumnType.TEXT },
    ];
    return <Table<LoanRow> data={rows} columns={columns} idField="id" isLoading={sample.isLoading} isHoverable />;
  }
  if (pattern === 'detail')
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <CardV2 variant={CardV2Variant.OUTLINED} title="Progress">
            <StepperV2
              steps={[
                { id: 1, title: 'Sureties', status: StepperV2StepStatus.COMPLETED },
                { id: 2, title: 'Accountant', status: StepperV2StepStatus.COMPLETED },
                { id: 3, title: 'DDO', status: StepperV2StepStatus.COMPLETED },
                { id: 4, title: 'Assessment', status: StepperV2StepStatus.COMPLETED },
                { id: 5, title: 'Secretary', status: StepperV2StepStatus.CURRENT },
                { id: 6, title: 'President', status: StepperV2StepStatus.PENDING },
                { id: 7, title: 'Disbursement', status: StepperV2StepStatus.PENDING },
              ]}
            />
          </CardV2>
          <CardV2 variant={CardV2Variant.OUTLINED} title="Office use (computed)">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <KeyValuePairV2 keyString="OL balance" value="₹48,200" />
              <KeyValuePairV2 keyString="SL balance" value="₹0" />
              <KeyValuePairV2 keyString="Interest to date" value="₹452" />
              <KeyValuePairV2 keyString="Share deposit" value="₹25,000" />
              <KeyValuePairV2 keyString="Net disbursable" value="₹1,76,348" />
              <KeyValuePairV2 keyString="Instalments" value="60" />
            </div>
          </CardV2>
        </div>
        <CardV2 variant={CardV2Variant.OUTLINED} title="Decision" subtitle="Secretary sign-off" actions={[{ text: 'Sign & forward' }, { text: 'Reject', buttonType: ButtonV2Type.DANGER }]} />
      </div>
    );
  if (pattern === 'form')
    return (
      <CardV2 variant={CardV2Variant.OUTLINED} title="Employment" subtitle="Step 3 of 7">
        <div className="grid gap-5 md:grid-cols-2">
          <TextInputV2 label="Department" value="Finance" onChange={() => undefined} />
          <TextInputV2 label="Designation" value="Junior Assistant" onChange={() => undefined} />
          <TextInputV2 label="Date of regular appointment" value="2021-06-14" onChange={() => undefined} hintText="As in the service register" />
          <TextInputV2 label="Shares proposed" value="20" onChange={() => undefined} hintText="20 × ₹100 = ₹2,000" />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <ButtonV2 text="Back" buttonType={ButtonV2Type.SECONDARY} />
          <ButtonV2 text="Save & continue" />
        </div>
      </CardV2>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCardV2 title="Active members" value="556" variant={StatCardV2Variant.NUMBER} />
      <StatCardV2 title="Loans outstanding" value="₹5.67 Cr" variant={StatCardV2Variant.NUMBER} />
      <StatCardV2 title="Deposits held" value="₹3.1 Cr" variant={StatCardV2Variant.NUMBER} />
      <StatCardV2 title="Collection" value="95.7%" variant={StatCardV2Variant.PROGRESS_BAR} progressValue={95.7} />
    </div>
  );
}

export function StatesTab() {
  const [params, setParams] = useSearchParams();
  const pattern = (params.get('pattern') ?? 'list') as PatternKey;
  const p = PATTERNS[pattern] ?? PATTERNS.list;
  const state = (VIEW_STATES as readonly string[]).includes(params.get('state') ?? '') ? (params.get('state') as ViewStateName) : 'ready';
  const set = (next: Record<string, string>) => setParams({ tab: 'states', pattern, state, ...next }, { replace: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-caption text-fg-tertiary">Pattern</span>
          {(Object.keys(PATTERNS) as PatternKey[]).map((k) => (
            <ButtonV2 key={k} text={PATTERNS[k].label} size={ButtonV2Size.SMALL} buttonType={k === pattern ? ButtonV2Type.PRIMARY : ButtonV2Type.SECONDARY} onClick={() => set({ pattern: k })} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-caption text-fg-tertiary">State</span>
          {VIEW_STATES.map((s) => (
            <ButtonV2 key={s} text={s} size={ButtonV2Size.SMALL} buttonType={s === state ? ButtonV2Type.PRIMARY : ButtonV2Type.SECONDARY} onClick={() => set({ state: s })} />
          ))}
        </div>
        <p className="text-caption text-fg-secondary">
          <span className="text-caption-strong text-fg">{state}:</span> {STATE_HELP[state]}
        </p>
      </div>

      {/* The frame mimics a real page so the state is judged in context. */}
      <div className="rounded-sheet border border-dashed border-line-strong bg-canvas p-6">
        <PageHeader title={p.title} description={`${p.label} · rendered in the "${state}" state`} />
        <ViewState
          state={state}
          layout={p.layout}
          empty={{ icon: p.icon, title: p.empty.title, description: p.empty.description, action: { label: p.empty.action, onClick: () => undefined } }}
          onClearFilters={() => undefined}
          onRetry={() => undefined}
        >
          <ReadyContent pattern={pattern} />
        </ViewState>
      </div>
    </div>
  );
}
