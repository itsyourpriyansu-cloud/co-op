// ST-43m Deduction entry and recovery (J-10 step 3, D-088), one member per step with live totals docked below.
// The DDO enters and submits; the Accountant enters a paper sheet, reviews, sends back or approves and posts.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { allocateRecovery, formatCycle, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { ActionAlert, ask, Loaded, useAction, FilterBar } from '@/components/staff';
import { api } from '@/lib/api';
import { ENTRY_LABEL, LINE_FILTERS } from '@/lib/staffCollections';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, SelectField, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function Recovery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  return (
    <Loaded page q={q} what="this sheet">
      {(d) => <Entry d={d} />}
    </Loaded>
  );
}

function Entry({ d }: { d: DemandSheetDetail }) {
  const id = d.sheet.id;
  const a = useAction();
  const [entered, setEntered] = useState<Record<string, string>>(() => Object.fromEntries(d.lines.map((l) => [l.memberId, String((l.deducted ?? l.totalDemand) / 100)])));
  const [filter, setFilter] = useState('all');
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const can = (x: string) => d.actions.includes(x);
  const canPost = can('postRecovery');
  const isDdo = can('submitEntry');
  const editable = canPost || can('saveEntry');

  const rows = useMemo(
    () =>
      d.lines.map((l) => {
        const amount = Math.round(Number(entered[l.memberId] ?? 0) * 100);
        const overSalary = l.availableSalary !== undefined && amount > l.availableSalary;
        return { ...l, amount, unpaid: Math.max(0, l.totalDemand - amount), excess: amount > l.totalDemand, overSalary, salaryLeft: l.availableSalary !== undefined ? l.availableSalary - amount : undefined };
      }),
    [d.lines, entered],
  );
  const visible = rows.filter((r) => (filter === 'short' ? r.unpaid > 0 : filter === 'full' ? r.unpaid === 0 : filter === 'outstanding' ? (r.previousOutstanding ?? 0) > 0 : filter === 'pending' ? r.deducted === undefined : true));
  const at = Math.min(index, Math.max(0, visible.length - 1));
  const sel = visible[at];
  const totals = { demand: rows.reduce((s, r) => s + r.totalDemand, 0), recovered: rows.reduce((s, r) => s + r.amount, 0), shortMembers: rows.filter((r) => r.unpaid > 0).length, invalid: rows.filter((r) => r.excess || r.overSalary).length };
  const unpaid = Math.max(0, totals.demand - totals.recovered);
  const preview = sel ? allocateRecovery(sel.components, Math.min(sel.amount, sel.totalDemand)) : undefined;
  const deductions = () => Object.fromEntries(rows.map((r) => [r.memberId, r.amount]));
  const fieldError = (memberId: string) => a.fields[`recovered.${memberId}`] ?? a.fields[`deductions.${memberId}`];

  // A server error on one member: go to that member.
  useEffect(() => {
    const hit = Object.keys(a.fields).map((k) => k.replace(/^(recovered|deductions)\./, '')).find((m) => rows.some((r) => r.memberId === m));
    if (hit) {
      setFilter('all');
      setIndex(rows.findIndex((r) => r.memberId === hit));
    }
  }, [a.fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => void a.run(() => api.demand.entry(id, 'saveEntry', { deductions: deductions() }));
  const leave = () => (router.canGoBack() ? router.back() : router.replace(`/staff/demand/${id}`));
  const submit = async () => {
    if (!(await ask('Submit to the Accountant', `${formatINR(totals.recovered)} deducted for ${rows.length} members.`, 'Submit'))) return;
    const ok = await a.run(async () => {
      await api.demand.entry(id, 'saveEntry', { deductions: deductions() });
      await api.demand.entry(id, 'submitEntry');
    });
    if (ok) leave();
  };
  const sendBack = async () => {
    const ok = await a.run(() => api.demand.entry(id, 'rejectEntry', { reason: reason.trim() }));
    if (ok) leave();
  };
  const post = async () => {
    if (!(await ask(`Post ${formatINR(totals.recovered)} for ${rows.length} members?`, `Creates one salary-recovery receipt per member, updates loans, CRD, SRDS and shares, posts to the ledger and notifies members. This cannot be undone. ${totals.shortMembers ? `${totals.shortMembers} member${totals.shortMembers === 1 ? '' : 's'} came short by ${formatINR(unpaid)} in total.` : 'Everyone recovered in full.'}`, 'Yes, approve and post'))) return;
    const ok = await a.run(() => api.demand.act(id, 'postRecovery', { recovered: deductions() }));
    if (ok) leave();
  };

  const entry = d.sheet.entry;
  const title = isDdo ? 'Enter deductions' : entry && (entry.status === 'SUBMITTED' || entry.status === 'UNDER_REVIEW') ? 'Review deductions' : 'Enter recovery';
  const invalid = totals.invalid > 0 || a.busy || a.unconfirmed;
  const err = sel ? (fieldError(sel.memberId) ?? (sel.excess ? 'More than the demand' : sel.overSalary ? 'More than the salary available' : undefined)) : undefined;

  return (
    <Screen
      header={<Header title={title} onBack={() => router.back()} />}
      footer={
        <View style={{ gap: space[3] }}>
          <Text role="captionStrong">
            Demand {formatINR(totals.demand)} · deducted {formatINR(totals.recovered)}
          </Text>
          <Text role="caption" tone={totals.invalid ? 'danger' : 'secondary'}>
            {totals.invalid ? `${totals.invalid} member${totals.invalid === 1 ? '' : 's'} above the limit` : `Unpaid ${formatINR(unpaid)} · ${totals.shortMembers} short`}
          </Text>
          {rejecting ? (
            <Button text="Send back" size="lg" fullWidth buttonType="danger" loading={a.busy} disabled={reason.trim().length < 10 || a.busy} onPress={() => void sendBack()} />
          ) : (
            <>
              {isDdo ? <Button text="Submit to the Accountant" size="lg" fullWidth loading={a.busy} disabled={invalid} onPress={() => void submit()} /> : null}
              {canPost ? <Button text="Approve and post" size="lg" fullWidth loading={a.busy} disabled={invalid} onPress={() => void post()} /> : null}
            </>
          )}
        </View>
      }
    >
      <Text role="caption" tone="secondary">
        {d.department?.name} · {formatCycle(d.sheet.cycle)}. A deduction can never be more than the demand or the salary available.
      </Text>
      {entry ? <Alert type={entry.status === 'REJECTED' ? 'warning' : 'primary'} heading={`Deductions ${ENTRY_LABEL[entry.status]}${entry.source === 'PHYSICAL_SHEET' ? ' (paper sheet)' : ' (entered online by the DDO)'}`} description={entry.status === 'REJECTED' ? `${entry.rejection?.byName}: ${entry.rejection?.remarks ?? ''}` : entry.submitted ? `Submitted by ${entry.submitted.byName}.` : entry.savedBy ? `Last saved by ${entry.savedBy.byName}.` : ''} /> : null}
      {!editable ? <Alert type="warning" heading="Nothing to enter now" description={d.sheet.status === 'RECOVERY_POSTED' ? 'Recovery is already posted.' : d.sheet.status !== 'SENT_TO_DDO' ? 'The Accountant certifies and sends the sheet to the DDO first.' : 'The deductions are with the Accountant for review.'} /> : null}

      <FilterBar>
        <SelectField compact label="Show" value={filter} options={LINE_FILTERS} onChange={(v) => (setFilter(v), setIndex(0))} />
        {visible.length ? <SelectField compact label="Member" searchable value={sel?.memberId ?? ''} options={visible.map((r) => ({ value: r.memberId, label: r.name, hint: `No. ${r.generalNo} · ${formatINR(r.amount)}` }))} onChange={(v) => setIndex(visible.findIndex((r) => r.memberId === v))} /> : null}
      </FilterBar>

      {sel ? (
        <>
          <Text role="captionStrong" tone="secondary">
            {sel.name} · {at + 1} of {visible.length}
          </Text>
          <Card>
            <Text role="caption" tone="tertiary">
              No. {sel.generalNo}
              {sel.enteredByName ? ` · ${sel.entrySource === 'PHYSICAL_SHEET' ? 'paper' : 'online'}, ${sel.enteredByName}` : ''}
            </Text>
            {sel.note ? (
              <Text role="caption" tone="warning">
                {sel.note}
              </Text>
            ) : null}
            <KeyValue label="Demand" value={formatINR(sel.totalDemand)} emphasis />
            <KeyValue label="Earlier dues" value={sel.previousOutstanding ? formatINR(sel.previousOutstanding) : '—'} />
            <KeyValue label="Salary available" value={sel.availableSalary !== undefined ? formatINR(sel.availableSalary) : 'Pay not certified'} />
            {sel.salaryLeft !== undefined ? <KeyValue label="Salary left" value={formatINR(Math.max(0, sel.salaryLeft))} /> : null}
            <KeyValue label="Unpaid" value={sel.unpaid ? formatINR(sel.unpaid) : 'None'} />
          </Card>
          <TextField key={sel.memberId} label="Deducted" prefix="₹" keyboardType="decimal-pad" editable={editable} accessibilityLabel={`Deducted from ${sel.name}`} value={entered[sel.memberId] ?? ''} onChangeText={(t) => setEntered((s) => ({ ...s, [sel.memberId]: t.replace(/[^0-9.]/g, '') }))} error={err} />
          <View style={{ flexDirection: 'row', gap: space[4] }}>
            <Button text="Previous" buttonType="secondary" style={{ flex: 1 }} disabled={at === 0} onPress={() => setIndex(at - 1)} />
            <Button text="Next member" buttonType="secondary" style={{ flex: 1 }} disabled={at >= visible.length - 1} onPress={() => setIndex(at + 1)} />
          </View>
          <Section title={`How ${formatINR(Math.min(sel.amount, sel.totalDemand))} is applied`}>
            <Card>
              {(preview?.components ?? []).map((c, i) => {
                const comp = sel.components[i]!;
                return <KeyValue key={i} label={`${i + 1}. ${comp.label}${comp.loanNo ? ` · ${comp.loanNo}` : ''}`} value={`${formatINR(c.allocated)} / ${formatINR(c.amount)}`} />;
              })}
              {sel.unpaid > 0 ? (
                <>
                  <Divider />
                  <Text role="caption" tone="danger">
                    Unpaid {formatINR(sel.unpaid)} stays as the member's dues. It is not added to next month's sheet.
                  </Text>
                </>
              ) : null}
            </Card>
          </Section>
        </>
      ) : (
        <Text role="body" tone="secondary">
          No member matches this filter.
        </Text>
      )}

      {editable ? (
        <View style={{ gap: space[3] }}>
          <Button text="Mark all fully recovered" buttonType="secondary" fullWidth onPress={() => setEntered(Object.fromEntries(d.lines.map((l) => [l.memberId, String(l.totalDemand / 100)])))} />
          {can('saveEntry') ? <Button text="Save draft" buttonType="secondary" fullWidth loading={a.busy} disabled={invalid} onPress={save} /> : null}
          {can('rejectEntry') ? <Button text={rejecting ? 'Keep the deductions' : 'Send back to the DDO'} buttonType="secondary" fullWidth onPress={() => setRejecting((r) => !r)} /> : null}
        </View>
      ) : null}
      {rejecting ? <TextField label="What to correct" required value={reason} onChangeText={setReason} multiline numberOfLines={3} placeholder="e.g. Check the deduction for No. 1103 against the pay bill" hint="At least 10 characters." error={a.fields.reason} /> : null}
      <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check the sheet', href: `/staff/demand/${id}` }} />
    </Screen>
  );
}
