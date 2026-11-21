// The "For Office Use" block (F2 / F3 back), shared by loan detail, assessment and both sanction steps.
import { amountInWords, formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { SanctionSheet } from '@tgs/types';
import { Card, Divider, MetadataListItem, Text } from '@/ui';

const taken = (on?: string) => (on ? ` · taken ${formatDisplayDate(on)}` : '');

export function StaffSanctionSheet({ sheet }: { sheet: SanctionSheet }) {
  return (
    <Card>
      <MetadataListItem label="OL balance" value={`${formatINR(sheet.balances.ordinary)}${taken(sheet.balances.ordinaryTakenOn)}`} />
      <MetadataListItem label="SL balance" value={`${formatINR(sheet.balances.salary)}${taken(sheet.balances.salaryTakenOn)}`} />
      <Divider />
      <MetadataListItem label="Sanction amount" value={formatINR(sheet.amount)} emphasis />
      <Text type="supporting" tone="secondary">
        {amountInWords(sheet.amount)}
      </Text>
      <MetadataListItem label="Instalments" value={`${sheet.instalments} × from ${formatCycle(sheet.firstDueCycle)} at ${sheet.ratePercent}%`} />
      {sheet.earlyInterest ? <MetadataListItem label="Interest for the days before the first month" value={formatINR(sheet.earlyInterest)} /> : null}
      <MetadataListItem label="EMI (first → last)" value={sheet.lastEmi !== sheet.emi ? `${formatINR(sheet.emi)} → ${formatINR(sheet.lastEmi)}` : formatINR(sheet.emi)} />
      <MetadataListItem label="Total interest" value={formatINR(sheet.totalInterest)} />
      <Divider />
      {sheet.topup ? (
        <>
          <MetadataListItem label={`Settles ${sheet.topup.loanNo}: principal`} value={formatINR(sheet.topup.outstandingPrincipal)} />
          <MetadataListItem label="Interest to date (BR-007)" value={formatINR(sheet.topup.accruedInterest)} />
        </>
      ) : null}
      <MetadataListItem label="Share deposit deduction (BR-004)" value={formatINR(sheet.shareDeduction)} />
      <MetadataListItem label="Net disbursable" value={formatINR(sheet.netDisbursable)} emphasis />
    </Card>
  );
}
