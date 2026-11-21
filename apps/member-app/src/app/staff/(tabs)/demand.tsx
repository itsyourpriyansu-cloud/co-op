// ST-40m Demand sheets: one card per department for the chosen month, with the next step for the signed-in user.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR, formatINRCompact } from '@tgs/domain';
import { FilterBar, Loaded, RecordCard, Stack2, StatTile, TileGrid } from '@/components/staff';
import { api } from '@/lib/api';
import { ENTRY_LABEL, SHEET_FILTERS } from '@/lib/staffCollections';
import { Button, EmptyState, Screen, SelectField, StatusToken, Token, Text } from '@/ui';
import { spacing } from '@/theme';

export default function Demand() {
  const params = useLocalSearchParams<{ cycle?: string }>();
  const [picked, setPicked] = useState<string>();
  const cycle = picked ?? params.cycle;
  const [filter, setFilter] = useState('all');
  const q = useQuery({ queryKey: ['demand-overview', cycle ?? 'current'], queryFn: () => api.demand.overview(cycle), refetchInterval: 20_000 });
  const d = q.data;
  const pct = d && d.totals.demand ? (d.totals.recovered / d.totals.demand) * 100 : 0;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <View style={{ flex: 1, gap: spacing[0.5] }}>
          <Text type="h1">Demand sheets</Text>
          <Text type="supporting" tone="secondary">
            Monthly salary deductions{d?.scope.departmentName ? ` · ${d.scope.departmentName} only` : ' by department'}
          </Text>
        </View>
        {d?.canGenerate && d.totals.notGenerated > 0 ? <Button label="Generate" size="sm" icon={Plus} onPress={() => router.push(`/staff/demand/generate?cycle=${d.cycle}`)} /> : null}
      </View>
      <FilterBar>
        <SelectField compact label="Month" value={d?.cycle ?? ''} options={(d?.cycles ?? []).map((c) => ({ value: c, label: `${formatCycle(c)}${c === d?.currentCycle ? ' (current)' : ''}` }))} onChange={setPicked} />
        <SelectField compact label="Show" value={filter} options={SHEET_FILTERS.map(({ label, value }) => ({ label, value }))} onChange={setFilter} />
      </FilterBar>
      <Loaded q={q} what="demand sheets">
        {(o) => {
          const rows = o.rows.filter(SHEET_FILTERS.find((f) => f.value === filter)!.match);
          return (
            <>
              <TileGrid>
                <StatTile label={`Demand · ${formatCycle(o.cycle)}`} value={formatINRCompact(o.totals.demand)} sub={`${o.totals.generated} of ${o.rows.length} generated`} />
                <StatTile label="Recovered" value={formatINRCompact(o.totals.recovered)} sub={o.totals.posted ? `${pct.toFixed(1)}% · ${o.totals.posted} posted` : 'Nothing posted yet'} />
                <StatTile label="Short" value={formatINRCompact(o.totals.short)} sub={`${o.rows.reduce((s, r) => s + r.shortMembers, 0)} members short`} />
                <StatTile label="Waiting on you" value={String(o.rows.filter((r) => r.myAction).length)} tone={o.rows.some((r) => r.myAction) ? 'warning' : 'neutral'} sub={o.totals.notGenerated ? `${o.totals.notGenerated} not generated` : 'All generated'} />
              </TileGrid>
              {!rows.length ? (
                <EmptyState icon={FileSpreadsheet} title="No department matches this filter" />
              ) : (
                <Stack2>
                  {rows.map((r) => (
                    <RecordCard
                      key={r.id ?? r.departmentId}
                      title={`${r.departmentName}${r.supplementNo ? ` · Supplement ${r.supplementNo}` : ''}`}
                      subtitle={`DDO ${r.ddoName}`}
                      amount={r.demand ? formatINR(r.demand) : '—'}
                      tag={<StatusToken entity="demandSheet" status={r.status} audience="staff" size="xs" />}
                      {...(r.id ? { onPress: () => router.push(`/staff/demand/${r.id}`) } : {})}
                      caption={[r.members ? `${r.members} members` : undefined, r.status === 'RECOVERY_POSTED' ? (r.short ? `short ${formatINR(r.short)} · ${r.shortMembers}` : 'recovered in full') : undefined, r.entryStatus && r.status === 'SENT_TO_DDO' ? `Deductions: ${ENTRY_LABEL[r.entryStatus]}` : undefined, r.sendBy && r.status !== 'RECOVERY_POSTED' ? `Send by ${formatDisplayDate(r.sendBy)}${r.sendLate ? ' · late' : ''}` : undefined].filter(Boolean).join(' · ')}
                    >
                      {r.myAction ? <Token text={r.myAction} status="info" size="xs" /> : null}
                    </RecordCard>
                  ))}
                </Stack2>
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
