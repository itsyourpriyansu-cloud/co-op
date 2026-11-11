// ST-41m Generate demand (J-10 step 1): month and departments, a preview per department, then Generate.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatCycle, formatINR } from '@tgs/domain';
import { ActionAlert, ask, Loaded, useAction, RecordCard, Stack2 } from '@/components/staff';
import { api } from '@/lib/api';
import { HEAD_COLUMNS } from '@/lib/staffCollections';
import { Alert, Button, Checkbox, Header, KeyValue, Screen, Segmented, Text } from '@/ui';
import { space } from '@/theme';

export default function GenerateDemand() {
  const params = useLocalSearchParams<{ cycle?: string }>();
  const overview = useQuery({ queryKey: ['demand-overview', 'current'], queryFn: () => api.demand.overview() });
  const options = overview.data ? overview.data.cycles.slice(0, 2).reverse() : [];
  const [picked, setCycle] = useState<string>();
  const cycle = picked ?? params.cycle ?? overview.data?.currentCycle ?? '';
  const preview = useQuery({ queryKey: ['demand-preview', cycle], queryFn: () => api.demand.preview(cycle), enabled: !!cycle });
  const [selected, setSelected] = useState<string[]>([]);
  const open = useMemo(() => (preview.data?.rows ?? []).filter((r) => !r.alreadyGenerated), [preview.data]);
  useEffect(() => setSelected(open.map((r) => r.departmentId)), [open]);
  const chosen = open.filter((r) => selected.includes(r.departmentId));
  const total = chosen.reduce((s, r) => s + r.total, 0);
  const a = useAction();
  const canGenerate = overview.data?.canGenerate !== false;

  const generate = async () => {
    if (!(await ask('Generate demand', `${chosen.length} sheet${chosen.length === 1 ? '' : 's'} for ${formatCycle(cycle)}, ${formatINR(total)} in all.`, 'Generate'))) return;
    const ok = await a.run(() => api.demand.generate(cycle, selected));
    if (ok) {
      if (router.canGoBack()) router.back();
      else router.replace('/staff/demand');
    }
  };

  return (
    <Screen
      header={<Header title="Generate demand" onBack={() => router.back()} />}
      {...(open.length
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                <Text role="captionStrong">
                  {canGenerate ? `${chosen.length} of ${open.length} selected · ${formatINR(total)}` : 'Only the Accountant generates demand sheets.'}
                </Text>
                <Button text={`Generate ${chosen.length} sheet${chosen.length === 1 ? '' : 's'}`} size="lg" fullWidth disabled={!chosen.length || !canGenerate || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void generate()} />
              </View>
            ),
          }
        : {})}
    >
      <Text role="body" tone="secondary">
        Builds each member's deduction from today's records: RRF, insurance, CRD, SRDS, first-demand shares and every running loan's instalment.
      </Text>
      {options.length > 1 ? <Segmented label="Month" value={cycle} options={options.map((c) => ({ value: c, label: formatCycle(c) }))} onChange={setCycle} /> : null}
      <Loaded q={preview} what="the preview">
        {(p) => (
          <>
            {p.insuranceMonth ? <Alert type="primary" heading="Insurance month" description="This cycle collects the yearly insurance contribution." /> : null}
            {!open.length ? <Alert type="success" heading={`Every department is generated for ${formatCycle(cycle)}`} description="Open a sheet from the list to certify or post it." /> : null}
            {/* What will be generated first; the ones already done follow as single lines. */}
            <Stack2>
              {[...p.rows].sort((x, y) => Number(x.alreadyGenerated) - Number(y.alreadyGenerated)).map((r) =>
                r.alreadyGenerated ? (
                  <RecordCard key={r.departmentId} title={r.departmentName} subtitle={r.warnings.join(' ') || 'Already generated'} amount={formatINR(r.total)} />
                ) : (
                  <View key={r.departmentId} style={{ gap: space[3], padding: space[8] }}>
                    <Checkbox checked={selected.includes(r.departmentId)} onChange={(v) => setSelected((s) => (v ? [...s, r.departmentId] : s.filter((x) => x !== r.departmentId)))} label={r.departmentName} description={`${r.members} members`} />
                    {r.warnings.map((w) => (
                      <Text key={w} role="caption" tone="warning">
                        {w}
                      </Text>
                    ))}
                    <Text role="caption" tone="secondary">
                      {HEAD_COLUMNS.filter((h) => (r.heads[h.head] ?? 0) > 0).map((h) => `${h.label} ${formatINR(r.heads[h.head]!)}`).join(' · ')}
                    </Text>
                    <KeyValue label="Total" value={formatINR(r.total)} emphasis />
                  </View>
                ),
              )}
            </Stack2>
          </>
        )}
      </Loaded>
      <ActionAlert action={a} heading="Couldn't generate" check={{ text: 'Check Demand sheets', href: '/staff/demand' }} />
    </Screen>
  );
}
