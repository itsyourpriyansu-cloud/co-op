// The "For Office Use" block (F2 / F3 back), shared by loan detail, assessment and both sanction steps.
import { amountInWords, formatCycle, formatDisplayDate, formatINR } from '@tgs/domain';
import type { SanctionSheet } from '@tgs/types';
import { Card, Divider, KeyValue, Text } from '@/ui';

const taken = (on?: string) => (on ? ` · taken ${formatDisplayDate(on)}` : '');

export function StaffSanctionSheet({ sheet }: { sheet: SanctionSheet }) {
  return (
    <Card>
      <KeyValue label="OL balance" value={`${formatINR(sheet.balances.ordinary)}${taken(sheet.balances.ordinaryTakenOn)}`} />
      <KeyValue label="SL balance" value={`${formatINR(sheet.balances.salary)}${taken(sheet.balances.salaryTakenOn)}`} />
      <Divider />
      <KeyValue label="Sanction amount" value={formatINR(sheet.amount)} emphasis />
      <Text role="caption" tone="tertiary">
        {amountInWords(sheet.amount)}
      </Text>
      <KeyValue label="Instalments" value={`${sheet.instalments} × from ${formatCycle(sheet.firstDueCycle)} at ${sheet.ratePercent}%`} />
      <KeyValue label="EMI (first → last)" value={sheet.lastEmi !== sheet.emi ? `${formatINR(sheet.emi)} → ${formatINR(sheet.lastEmi)}` : formatINR(sheet.emi)} />
      <KeyValue label="Total interest" value={formatINR(sheet.totalInterest)} />
      <Divider />
      {sheet.topup ? (
        <>
          <KeyValue label={`Settles ${sheet.topup.loanNo}: principal`} value={formatINR(sheet.topup.outstandingPrincipal)} />
          <KeyValue label="Interest to date (BR-007)" value={formatINR(sheet.topup.accruedInterest)} />
        </>
      ) : null}
      <KeyValue label="Share deposit deduction (BR-004)" value={formatINR(sheet.shareDeduction)} />
      <KeyValue label="Net disbursable" value={formatINR(sheet.netDisbursable)} emphasis />
    </Card>
  );
}
