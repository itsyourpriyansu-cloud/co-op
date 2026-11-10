// SETTLE-m (F-08, D-098): a member leaves and is settled against the gratuity. The letter prints from the console.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { SettlementLine, SettlementView } from '@tgs/types';
import { ActionAlert, ask, Loaded, MoneyField, PrintButton, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, Card, DateField, Divider, Header, KeyValue, Screen, Section, Segmented, Text, TextField } from '@/ui';
import { space } from '@/theme';

type ExitStatus = 'RETIRED' | 'RESIGNED' | 'DECEASED';
const EXIT_LABEL: Record<ExitStatus, string> = { RETIRED: 'Retired', RESIGNED: 'Resigned', DECEASED: 'Deceased' };

function Lines({ title, lines, total }: { title: string; lines: SettlementLine[]; total: number }) {
  return (
    <Section title={title}>
      <Card>
        {lines.length ? (
          lines.map((l) => <KeyValue key={l.key} label={l.label} value={formatINR(l.amount)} />)
        ) : (
          <Text role="caption" tone="tertiary">
            Nil
          </Text>
        )}
        <Divider />
        <KeyValue label="Total" value={formatINR(total)} emphasis />
      </Card>
    </Section>
  );
}

function ExitForm({ memberId }: { memberId: string }) {
  const [status, setStatus] = useState<ExitStatus | ''>('');
  const [date, setDate] = useState<string>();
  const [remarks, setRemarks] = useState('');
  const a = useAction();
  const save = async () => {
    if (!status || !date || !(await ask('Mark as left', `Demand stops and the final settlement opens. This can't be undone here.`, 'Mark as left'))) return;
    await a.run(() => api.members.exit(memberId, { status, date, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }));
  };
  return (
    <Section title="Member leaves" description="Demand stops and the final settlement opens. This cannot be undone here.">
      <View style={{ gap: space[8] }}>
        <Segmented label="Reason" value={status} options={(['RETIRED', 'RESIGNED', 'DECEASED'] as const).map((s) => ({ value: s, label: EXIT_LABEL[s] }))} onChange={(v) => setStatus(v as ExitStatus)} error={a.fields.status} />
        <DateField label="Date" required value={date} onChange={setDate} error={a.fields.date} />
        <TextField label="Remarks" value={remarks} onChangeText={setRemarks} hint="e.g. retirement order or death certificate number" error={a.fields.remarks} />
        <ActionAlert action={a} heading="Not saved" />
        <Button text="Mark as left" size="lg" fullWidth disabled={!status || !date || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />
      </View>
    </Section>
  );
}

function PostForm({ view }: { view: SettlementView }) {
  const st = view.statement!;
  const deceased = view.settlement?.exit.status === 'DECEASED';
  const [offset, setOffset] = useState(true);
  const [payTo, setPayTo] = useState<'MEMBER' | 'NOMINEE'>(deceased ? 'NOMINEE' : 'MEMBER');
  const required = offset ? Math.max(0, -st.net) : st.totalOwed;
  const paid = offset ? Math.max(0, st.net) : st.totalHeld;
  const [received, setReceived] = useState<number>(required);
  const [reference, setReference] = useState('');
  const a = useAction();
  const post = async () => {
    if (await ask('Post the settlement', 'One ledger entry closes the loans, deposits and shares. It cannot be reversed from the app.', 'Post')) await a.run(() => api.members.postSettlement(view.member.id, { offset, payTo, received, reference: reference.trim() }));
  };
  return (
    <Section title="Post the settlement" description="Once the money has moved: one ledger entry closes the loans, deposits and shares.">
      <View style={{ gap: space[8] }}>
        <Segmented
          label="How the money moves"
          value={offset ? 'NET' : 'GROSS'}
          options={[{ value: 'NET', label: 'Offset (net only)' }, { value: 'GROSS', label: 'Both in full' }]}
          onChange={(v) => {
            setOffset(v === 'NET');
            setReceived(v === 'NET' ? Math.max(0, -st.net) : st.totalOwed);
          }}
        />
        {!deceased ? <Segmented label="Pay to" value={payTo} options={[{ value: 'MEMBER', label: 'Member' }, { value: 'NOMINEE', label: 'Nominee' }]} onChange={(v) => setPayTo(v as 'MEMBER' | 'NOMINEE')} /> : null}
        <MoneyField label="Received from the pay office (gratuity)" value={received} onChange={setReceived} error={a.fields.received} hint={required ? `${formatINR(required)} expected` : 'Nothing to receive'} />
        <Card>
          <KeyValue label="To pay" value={formatINR(paid)} emphasis />
          <KeyValue label="Paid to" value={payTo === 'NOMINEE' ? `Nominee, ${view.member.nominee?.name ?? ''}` : view.member.name} />
        </Card>
        <TextField label="Cheque / transfer reference" required value={reference} onChangeText={setReference} error={a.fields.reference} />
        <ActionAlert action={a} heading="Not posted" check={{ text: 'Check the member', href: `/staff/member/${view.member.id}` }} />
        <Button text="Post the settlement" size="lg" fullWidth disabled={a.busy || a.unconfirmed} loading={a.busy} onPress={() => void post()} />
      </View>
    </Section>
  );
}

export default function Settlement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['settlement', id], queryFn: () => api.members.settlement(id) });
  return (
    <Screen header={<Header title="Final settlement" onBack={() => router.back()} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Loaded q={q} what="the settlement">
        {(v) => {
          const s = v.settlement;
          const st = v.statement;
          const deceased = s?.exit.status === 'DECEASED';
          if (!s)
            return v.canExit ? (
              <ExitForm memberId={id} />
            ) : (
              <Text role="body" tone="secondary">
                {v.member.name} has not left the society.
              </Text>
            );
          return (
            <>
              <Card>
                <Text role="cardTitle">{v.member.name}</Text>
                <Text role="caption" tone="secondary">
                  General No. {v.member.generalNo} · {EXIT_LABEL[s.exit.status as ExitStatus]} on {formatDisplayDate(s.exit.date)}
                </Text>
              </Card>
              {st ? (
                <>
                  <Lines title="Due to the society" lines={st.owes} total={st.totalOwed} />
                  <Lines title="Held by the society for the member" lines={st.holds} total={st.totalHeld} />
                  <Alert type={st.net < 0 ? 'warning' : st.net > 0 ? 'primary' : 'success'} heading={st.net < 0 ? `Recover ${formatINR(-st.net)} from the gratuity` : st.net > 0 ? `Pay ${formatINR(st.net)} to ${deceased ? `the nominee, ${v.member.nominee?.name ?? ''}` : 'the member'}` : 'Settled in full'} description={st.net < 0 ? 'As agreed in the salary recovery agreement, the pay office remits it to the society.' : st.net > 0 ? 'Nothing is due to the society.' : 'Nothing is due either way.'} />
                  <PrintButton text="Print the settlement letter" path={`/members/${id}/settlement`} />
                </>
              ) : null}
              {s.posted ? <Alert type="success" heading="Posted" description={`${formatDisplayDateTime(s.posted.at)} by ${s.posted.byName}: received ${formatINR(s.posted.received)}, paid ${formatINR(s.posted.paid)} to ${s.posted.payeeName}, ref ${s.posted.reference}${s.posted.journalNo ? `, ${s.posted.journalNo}` : ''}.`} /> : null}
              {s.status === 'OPEN' && v.canPost && st ? <PostForm view={v} /> : null}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
