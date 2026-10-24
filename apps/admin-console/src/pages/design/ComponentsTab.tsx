// Components: Blend V2 as TGSECCSL uses it (docs/18 §7), plus our domain composites.
import { useState, type ReactNode } from 'react';
import { CircleCheck, Download, HandCoins, Plus, Search, Send, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  addSnackbarV2,
  AlertV2,
  AlertV2SubType,
  AlertV2Type,
  AvatarV2,
  AvatarV2Size,
  ButtonV2,
  ButtonV2Size,
  ButtonV2SubType,
  ButtonV2Type,
  CardV2,
  CardV2Variant,
  ColumnType,
  KeyValuePairV2,
  KeyValuePairV2Size,
  ModalV2,
  ProgressBarV2,
  SearchInputV2,
  Skeleton,
  SnackbarV2Variant,
  Spinner,
  StatCardV2,
  StatCardV2ChangeType,
  StatCardV2Variant,
  StepperV2,
  StepperV2StepStatus,
  TagV2,
  TagV2Color,
  TagV2Size,
  TagV2SubType,
  TagV2Type,
  TextInputV2,
  Timeline,
  TimelineHeader,
  TimelineNodeStatus,
  TimelineSubstep,
  TooltipV2,
  type ColumnDefinition,
} from '@juspay/blend-design-system';
import { amountInWords, calculateLeftoverService, checkSuretyRetirement, checkTenureEligibility, formatDuration, formatINR, toPaise } from '@tgs/domain';
import type { MemberStatus } from '@tgs/types';
import { Money } from '@/components/Money';
import { SectionTitle } from '@/components/PageHeader';
import { RuleCheckList } from '@/components/RuleCheckList';
import { StatusTag } from '@/components/StatusTag';
import { api } from '@/lib/api';
import { Table } from '@/components/Table';

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {note && <p className="-mt-2 mb-3 max-w-3xl text-caption text-fg-tertiary">{note}</p>}
      <CardV2 variant={CardV2Variant.OUTLINED}>{children}</CardV2>
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-1 items-center gap-3 border-b border-line-subtle py-3 last:border-0 md:grid-cols-[160px_1fr]">
    <span className="text-caption text-fg-tertiary">{label}</span>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>
);

type MemberRow = {
  id: string;
  generalNo: string;
  name: string;
  department: string;
  designation: string;
  status: string;
  service: string;
  outstanding: number;
};

export function ComponentsTab() {
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('20000');
  const sample = useQuery({ queryKey: ['dataset-sample'], queryFn: api.demo.sample });

  const rows: MemberRow[] = (sample.data?.members ?? []).map((m) => ({
    id: m.id,
    generalNo: m.generalNo,
    name: m.name,
    department: m.department,
    designation: m.designation,
    status: m.status,
    service: formatDuration(m.leftoverMonths),
    outstanding: m.outstanding,
  }));
  const columns: ColumnDefinition<MemberRow>[] = [
    { field: 'generalNo', header: 'General No.', type: ColumnType.TEXT, width: '120px' },
    { field: 'name', header: 'Member', type: ColumnType.TEXT },
    { field: 'department', header: 'Department', type: ColumnType.TEXT },
    { field: 'designation', header: 'Designation', type: ColumnType.TEXT },
    { field: 'status', header: 'Status', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, row) => <StatusTag entity="member" status={row.status as MemberStatus} /> },
    { field: 'service', header: 'Service left', type: ColumnType.TEXT },
    { field: 'outstanding', header: 'Loan outstanding', type: ColumnType.REACT_ELEMENT, isSortable: false, renderCell: (_v, row) => <Money value={row.outstanding} /> },
  ];

  const amountPaise = toPaise(Number(amount.replace(/[^0-9.]/g, '')) || 0);
  const ramaiah = calculateLeftoverService('2027-12-31', '2026-10-24');

  return (
    <div className="flex flex-col gap-10">
      <Block title="Buttons" note="One primary action per view. Danger only for irreversible actions (reject, reset). Icon-only buttons always carry an aria-label.">
        <Row label="Types">
          <ButtonV2 text="Sanction loan" buttonType={ButtonV2Type.PRIMARY} />
          <ButtonV2 text="Return to applicant" buttonType={ButtonV2Type.SECONDARY} />
          <ButtonV2 text="Disburse ₹2,45,000" buttonType={ButtonV2Type.SUCCESS} leftSlot={{ slot: <Send size={16} /> }} />
          <ButtonV2 text="Reject" buttonType={ButtonV2Type.DANGER} />
          <ButtonV2 text="View schedule" buttonType={ButtonV2Type.PRIMARY} subType={ButtonV2SubType.INLINE} />
        </Row>
        <Row label="Sizes">
          <ButtonV2 text="Small" size={ButtonV2Size.SMALL} />
          <ButtonV2 text="Medium" size={ButtonV2Size.MEDIUM} />
          <ButtonV2 text="Large" size={ButtonV2Size.LARGE} />
        </Row>
        <Row label="States">
          <ButtonV2 text="Saving…" loading />
          <ButtonV2 text="Disabled" disabled />
          <ButtonV2 subType={ButtonV2SubType.ICON_ONLY} buttonType={ButtonV2Type.SECONDARY} leftSlot={{ slot: <Download size={16} /> }} aria-label="Download" />
          <ButtonV2 text="New member" leftSlot={{ slot: <Plus size={16} /> }} />
        </Row>
      </Block>

      <Block title="Tags" note="Status tags come from StatusTag (status language tab). Other tags label categories and counts.">
        {([TagV2Type.SUBTLE, TagV2Type.ATTENTIVE, TagV2Type.NO_FILL] as const).map((type) => (
          <Row key={type} label={type}>
            {[TagV2Color.NEUTRAL, TagV2Color.PRIMARY, TagV2Color.SUCCESS, TagV2Color.WARNING, TagV2Color.ERROR, TagV2Color.PURPLE].map((color) => (
              <TagV2 key={color} text={color} type={type} color={color} subType={TagV2SubType.ROUNDED} size={TagV2Size.SM} />
            ))}
          </Row>
        ))}
        <Row label="Domain status">
          <StatusTag entity="loan" status="SANCTION_SECRETARY" />
          <StatusTag entity="loan" status="ACTIVE" />
          <StatusTag entity="membership" status="INFO_REQUESTED" />
          <StatusTag entity="deposit" status="PLEDGED" />
          <StatusTag entity="loan" status="REJECTED" />
        </Row>
      </Block>

      <Block title="Alerts" note="Inline, in reading order. Use a modal only when the user must decide before continuing.">
        <div className="flex flex-col gap-3">
          <AlertV2 type={AlertV2Type.PRIMARY} subType={AlertV2SubType.SUBTLE} heading="Demand sheet generated" description="October 2026 · Finance · 41 members. Certify it before sending to the DDO (BR-030)." />
          <AlertV2 type={AlertV2Type.SUCCESS} subType={AlertV2SubType.SUBTLE} heading="Recovery posted" description="₹4,12,300 allocated across 41 members. 2 short recoveries flagged." />
          <AlertV2 type={AlertV2Type.WARNING} subType={AlertV2SubType.SUBTLE} heading="Surety retires during the loan" description="K. Mallesham retires on 30 Jun 2027, before the last instalment (BR-024). This is a warning, not a block." />
          <AlertV2 type={AlertV2Type.ERROR} subType={AlertV2SubType.SUBTLE} heading="Tenure exceeds remaining service" description="Remaining service is 14 months. The maximum available tenure is 13 months (BR-002)." actions={{ primaryAction: { text: 'Use 13 months', onClick: () => undefined } }} />
          <AlertV2 type={AlertV2Type.PURPLE} subType={AlertV2SubType.SUBTLE} heading="Awaiting President" description="Signed by Padma Reddy (Secretary) on 23 Oct 2026, 11:40." />
        </div>
      </Block>

      <Block title="Stat cards" note="KPIs: value uses the metric role (tabular). Show change vs the previous period with direction and meaning.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCardV2 title="Loans outstanding" value="₹5.67 Cr" variant={StatCardV2Variant.NUMBER} titleIcon={<HandCoins size={16} />} change={{ value: '2.4%', changeType: StatCardV2ChangeType.INCREASE }} subtitle="vs last cycle" />
          <StatCardV2 title="Active members" value="556" variant={StatCardV2Variant.NUMBER} titleIcon={<Users size={16} />} subtitle="5 joined this month" />
          <StatCardV2 title="Collection rate" value="95.7%" variant={StatCardV2Variant.PROGRESS_BAR} progressValue={95.7} />
          <StatCardV2 title="Loading state" value="" variant={StatCardV2Variant.NUMBER} skeleton={{ show: true, variant: 'pulse' }} />
        </div>
      </Block>

      <Block title="Inputs" note="Label above, hint below, error replaces hint. Money inputs show the amount in words (paper forms).">
        <div className="grid gap-6 md:grid-cols-2">
          <TextInputV2 label="Loan amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} hintText={amountPaise ? amountInWords(amountPaise) : 'Enter an amount'} inputMode="numeric" />
          <TextInputV2 label="Instalments" value="24" onChange={() => undefined} error={{ show: true, message: 'Max 13 months: remaining service is 14 months (BR-002).' }} />
          <TextInputV2 label="General No." value="1101" onChange={() => undefined} disabled hintText="Read-only: from Member Master" />
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">Search</span>
            <SearchInputV2 value="" placeholder="Search by name, General No. or mobile" leftSlot={<Search size={16} />} onChange={() => undefined} />
          </div>
        </div>
      </Block>

      <Block title="Cards & key-value pairs" note="Outlined cards for content, elevated only for floating/selected items. Key-value pairs for record summaries.">
        <div className="grid gap-4 lg:grid-cols-3">
          <CardV2 variant={CardV2Variant.OUTLINED} title="Lakshmi Devi" subtitle="General No. 1101 · Finance" eyebrow="Member">
            <div className="grid grid-cols-2 gap-4">
              <KeyValuePairV2 keyString="Designation" value="Section Officer" size={KeyValuePairV2Size.SM} />
              <KeyValuePairV2 keyString="Service left" value="16 yrs 9 mths" size={KeyValuePairV2Size.SM} />
              <KeyValuePairV2 keyString="Share deposit" value={formatINR(toPaise(1000))} size={KeyValuePairV2Size.SM} />
              <KeyValuePairV2 keyString="Loans" value="1 active" size={KeyValuePairV2Size.SM} />
            </div>
          </CardV2>
          <CardV2 variant={CardV2Variant.ELEVATED} title="Elevated" description="Use for selected or floating content only." actions={[{ text: 'Open', buttonType: ButtonV2Type.SECONDARY }]} />
          <CardV2 variant={CardV2Variant.GHOST} title="Ghost" description="Grouping without a border, inside an outlined parent." />
        </div>
      </Block>

      <Block title="Workflow: stepper & timeline" note="Stepper = where the loan is. Timeline = who did what, when (audit trail).">
        <div className="flex flex-col gap-8">
          <StepperV2
            steps={[
              { id: 1, title: 'Submitted', status: StepperV2StepStatus.COMPLETED },
              { id: 2, title: 'Sureties', status: StepperV2StepStatus.COMPLETED },
              { id: 3, title: 'Accountant', status: StepperV2StepStatus.COMPLETED },
              { id: 4, title: 'DDO', status: StepperV2StepStatus.COMPLETED },
              { id: 5, title: 'Assessment', status: StepperV2StepStatus.COMPLETED },
              { id: 6, title: 'Secretary', status: StepperV2StepStatus.COMPLETED },
              { id: 7, title: 'President', status: StepperV2StepStatus.CURRENT },
              { id: 8, title: 'Disbursement', status: StepperV2StepStatus.PENDING },
            ]}
          />
          <Timeline>
            <TimelineHeader title="Signed by Secretary" status={TimelineNodeStatus.SUCCESS} timestamp="23 Oct 2026, 11:40">
              <TimelineSubstep title="Padma Reddy · Secretary" description="Recommended for sanction. Surety particulars verified." />
            </TimelineHeader>
            <TimelineHeader title="Assessment completed" status={TimelineNodeStatus.SUCCESS} timestamp="22 Oct 2026, 15:05">
              <TimelineSubstep title="Suresh Goud · Accountant" description="Net disbursable ₹2,25,000 after share deposit ₹25,000." />
            </TimelineHeader>
            <TimelineHeader title="Surety retires during the loan" status={TimelineNodeStatus.WARNING} timestamp="21 Oct 2026, 10:12" />
          </Timeline>
        </div>
      </Block>

      <Block title="Feedback: progress, loading, toast, modal, tooltip">
        <Row label="Progress">
          <div className="w-64">
            <ProgressBarV2 value={64} showLabel aria-label="Collection progress" />
          </div>
          <Spinner size="sm" color="primary" />
          <Spinner size="md" color="primary" />
        </Row>
        <Row label="Skeleton">
          <div className="flex w-full max-w-md flex-col gap-2">
            <Skeleton height={16} width="60%" shape="rounded" />
            <Skeleton height={16} shape="rounded" />
            <Skeleton height={16} width="80%" shape="rounded" />
          </div>
        </Row>
        <Row label="Toast">
          <ButtonV2 text="Success toast" buttonType={ButtonV2Type.SECONDARY} onClick={() => addSnackbarV2({ header: 'Loan sanctioned', description: 'LN-2026-00412 · ₹2,50,000', variant: SnackbarV2Variant.SUCCESS })} />
          <ButtonV2 text="Error toast" buttonType={ButtonV2Type.SECONDARY} onClick={() => addSnackbarV2({ header: "Couldn't post recovery", description: 'Network error. Nothing was saved.', variant: SnackbarV2Variant.ERROR })} />
        </Row>
        <Row label="Modal">
          <ButtonV2 text="Confirm sanction…" onClick={() => setModalOpen(true)} />
          <ModalV2
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Sanction ₹2,50,000 to Lakshmi Devi?"
            subtitle="Final signature (President). This cannot be undone."
            primaryAction={{ text: 'Yes, sanction', onClick: () => setModalOpen(false) }}
            secondaryAction={{ text: 'Cancel', buttonType: ButtonV2Type.SECONDARY, onClick: () => setModalOpen(false) }}
          >
            <div className="grid grid-cols-2 gap-4">
              <KeyValuePairV2 keyString="Net disbursable" value="₹2,25,000" />
              <KeyValuePairV2 keyString="EMI (first)" value="₹6,458" />
            </div>
          </ModalV2>
        </Row>
        <Row label="Tooltip">
          <TooltipV2 content="Left-over service = months until the date of retirement (BR-001).">
            <span className="cursor-help border-b border-dashed border-line-strong text-body text-fg">Service left</span>
          </TooltipV2>
        </Row>
        <Row label="Avatars">
          {[AvatarV2Size.SM, AvatarV2Size.REGULAR, AvatarV2Size.MD, AvatarV2Size.LG, AvatarV2Size.XL].map((s) => (
            <AvatarV2 key={s} size={s} fallbackText="Lakshmi Devi" alt="Lakshmi Devi" />
          ))}
        </Row>
      </Block>

      <Block title="Data table (live sample)" note="Lists use Blend DataTable: key column left, numbers right-aligned and tabular, status as StatusTag. Rows come from the mock API.">
        <Table<MemberRow> data={rows} columns={columns} idField="id" isLoading={sample.isLoading} error={sample.isError} onRetry={() => void sample.refetch()} isHoverable enableSearch searchPlaceholder="Search members" />
      </Block>

      <Block title="TGSECCSL composites (domain-backed)" note="These run the real rule engine (@tgs/domain), so the console, the app and the API always agree.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-label text-fg">Eligibility panel · Ramaiah asks for 24 months</h3>
            <RuleCheckList checks={[checkTenureEligibility(ramaiah.months, 24), checkTenureEligibility(ramaiah.months, 12), checkSuretyRetirement('2027-06-30', '2028-03')]} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-label text-fg">Money</h3>
            <div className="flex flex-wrap items-baseline gap-4">
              <Money value={toPaise(1245000)} className="text-metric text-fg" />
              <Money value={toPaise(45200000)} compact className="text-metric-sm text-fg" />
              <Money value={toPaise(3200)} tone="credit" className="text-amount" />
              <Money value={-toPaise(1500)} tone="debit" className="text-amount" />
            </div>
            <p className="text-caption text-fg-secondary">{amountInWords(toPaise(125000))}</p>
            <div className="flex items-center gap-2 text-caption text-success-fg">
              <CircleCheck size={16} /> Certified by DDO · 12 Oct 2026
            </div>
          </div>
        </div>
      </Block>
    </div>
  );
}
