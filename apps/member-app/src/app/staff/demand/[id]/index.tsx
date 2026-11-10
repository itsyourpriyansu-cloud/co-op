// ST-42m Demand sheet: totals by head, one section per member with the recovery order, and the next action.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { Expand, Loaded, plain, PrintButton, ShareCsvButton, Stack2 } from '@/components/staff';
import { api } from '@/lib/api';
import { ENTRY_LABEL, HEAD_COLUMNS } from '@/lib/staffCollections';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, StageTracker, StatusTag, Text, TextField } from '@/ui';
import { space } from '@/theme';

function csvRows(d: DemandSheetDetail) {
  const heads = HEAD_COLUMNS.filter((h) => d.totals.heads[h.head]);
  const posted = d.sheet.status === 'RECOVERY_POSTED';
  return [['General No.', 'Name', 'Designation', ...heads.map((h) => h.label), 'Total demand', ...(posted ? ['Recovered', 'Short'] : [])], ...d.lines.map((l) => [l.generalNo, l.name, l.designation, ...heads.map((h) => (l.heads[h.head] ?? 0) / 100), l.totalDemand / 100, ...(posted ? [(l.recovered ?? 0) / 100, (l.short ?? 0) / 100] : [])]), ['', 'Total', '', ...heads.map((h) => (d.totals.heads[h.head] ?? 0) / 100), d.totals.demand / 100, ...(posted ? [d.totals.recovered / 100, d.totals.short / 100] : [])]];
}

export default function DemandSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  return (
    <Loaded page q={q} what="this sheet">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function Body({ d, refetching, refetch }: { d: DemandSheetDetail; refetching: boolean; refetch: () => void }) {
  const sh = d.sheet;
  const [q, setQ] = useState('');
  const posted = sh.status === 'RECOVERY_POSTED';
  const heads = HEAD_COLUMNS.filter((h) => d.totals.heads[h.head]);
  const needle = q.trim().toLowerCase();
  const lines = d.lines.filter((l) => !needle || l.name.toLowerCase().includes(needle) || l.generalNo.includes(needle));
  const entryOpen = sh.entry?.status === 'SUBMITTED' || sh.entry?.status === 'UNDER_REVIEW';
  const go = (a: string) => router.push(`/staff/demand/${sh.id}/${a}`);
  const buttons: Array<{ text: string; onPress: () => void }> = [
    ...(d.actions.includes('certify') ? [{ text: 'Certify', onPress: () => go('certify') }] : []),
    ...(d.actions.includes('sendToDdo') ? [{ text: 'Send to DDO', onPress: () => go('sendToDdo') }] : []),
    ...(d.actions.includes('postRecovery') ? [{ text: entryOpen ? 'Review and post' : 'Enter recovery', onPress: () => go('recovery') }] : !d.actions.includes('postRecovery') && d.actions.includes('saveEntry') ? [{ text: 'Enter deductions', onPress: () => go('recovery') }] : []),
  ];

  return (
    <Screen
      header={<Header title="Demand sheet" onBack={() => router.back()} />}
      refreshing={refetching}
      onRefresh={refetch}
      {...(buttons.length
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                {buttons.map((b) => (
                  <Button key={b.text} text={b.text} size="lg" fullWidth onPress={b.onPress} />
                ))}
              </View>
            ),
          }
        : {})}
    >
      <View style={{ gap: space[2] }}>
        <Text role="pageTitle">
          {d.department?.name} · {formatCycle(sh.cycle)}
        </Text>
        <Text role="caption" tone="secondary">
          DDO {d.department?.ddoName}, {d.department?.ddoDesignation} · {d.lines.length} members
        </Text>
        <StatusTag entity="demandSheet" status={sh.status} audience="staff" />
      </View>

      <Card>
        <StageTracker stages={d.stages.map((s, i) => ({ key: `${i}`, title: plain(s.title), ...(s.by ? { description: s.by, ...(s.date ? { date: formatDisplayDate(s.date.slice(0, 10)) } : {}) } : {}), status: s.status === 'done' ? 'done' : s.status === 'current' ? 'current' : 'todo' }))} />
      </Card>

      {sh.status === 'SENT_TO_DDO' ? <Alert type={sh.entry?.status === 'REJECTED' ? 'warning' : 'primary'} heading={sh.entry ? `Deductions ${ENTRY_LABEL[sh.entry.status]}${sh.entry.source === 'PHYSICAL_SHEET' ? ' (paper sheet)' : ' (entered online by the DDO)'}` : 'With the DDO for deduction'} description={sh.entry?.status === 'REJECTED' ? `${sh.entry.rejection?.byName}: ${sh.entry.rejection?.remarks ?? ''}` : "The DDO enters what was actually deducted (or sends a paper sheet the Accountant enters). The Accountant checks and posts. Short amounts become the member's dues."} /> : null}
      {d.sendBy && !posted ? (
        <Text role="caption" tone={d.sendLate ? 'danger' : 'tertiary'}>
          To reach the DDO by {formatDisplayDate(d.sendBy)}
          {d.sendLate ? ' · sent late' : ''}
        </Text>
      ) : null}

      <Section title="Totals">
        <Card>
          {heads.map((h) => (
            <KeyValue key={h.head} label={h.label} value={formatINR(d.totals.heads[h.head] ?? 0)} />
          ))}
          <KeyValue label={`Demand · ${d.lines.length} members`} value={formatINR(d.totals.demand)} emphasis />
          {posted ? <KeyValue label="Recovered" value={formatINR(d.totals.recovered)} /> : null}
          {posted ? <KeyValue label="Short" value={d.totals.short ? formatINR(d.totals.short) : '—'} /> : null}
        </Card>
      </Section>

      {sh.certified ? (
        <Text role="caption" tone="secondary">
          Certified correct by {sh.certified.byName}, {formatDisplayDateTime(sh.certified.at)}
          {sh.sent ? ` · sent to the DDO ${formatDisplayDateTime(sh.sent.at)}` : ''}
          {sh.posted ? ` · recovery posted ${formatDisplayDateTime(sh.posted.at)}` : ''}
        </Text>
      ) : null}

      <Section title="Members">
        <TextField compact label="Search" value={q} onChangeText={setQ} placeholder="Name or General No." autoCorrect={false} />
        <Stack2>
          {lines.map((l) => (
            <Expand
              flush
              key={l.memberId}
              title={`${l.name} · No. ${l.generalNo}`}
              badge={
                <Text role="captionStrong" tone={(l.short ?? 0) > 0 ? 'danger' : 'primary'}>
                  {formatINR(l.totalDemand)}
                </Text>
              }
            >
              <Text role="caption" tone="tertiary">
                {l.designation}
                {posted ? ` · recovered ${formatINR(l.recovered ?? 0)}${l.short ? ` · short ${formatINR(l.short)}` : ''}` : ''}
              </Text>
              {l.components.map((c, i) => (
                <KeyValue key={i} label={`${i + 1}. ${c.label}${c.loanNo ? ` · ${c.loanNo}` : ''}`} value={posted ? `${formatINR(c.allocated)} / ${formatINR(c.amount)}` : formatINR(c.amount)} />
              ))}
            </Expand>
          ))}
        </Stack2>
      </Section>

      <View style={{ gap: space[3] }}>
        <ShareCsvButton title={`Demand ${sh.cycle}`} rows={() => csvRows(d)} />
        <PrintButton path={`/demand-sheets/${sh.id}`} />
      </View>
    </Screen>
  );
}
