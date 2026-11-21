// D-124: Regenerate a sheet that is not certified yet, or add a supplementary sheet for members the
// month's sheet missed. Shows who would be added first; the server repeats every check.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCycle, formatINR } from '@tgs/domain';
import type { DemandSheetDetail } from '@tgs/types';
import { ActionAlert, DoneAlert, Loaded, useAction } from '@/components/staff';
import { api } from '@/lib/api';
import { Banner, Button, Card, Header, MetadataListItem, Screen, Section, Text } from '@/ui';

export default function SheetTopUp() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const q = useQuery({ queryKey: ['demand-sheet', id], queryFn: () => api.demand.sheet(id) });
  return (
    <Loaded page q={q} what="this sheet">
      {(d) => <Decide d={d} mode={mode === 'supplement' ? 'supplement' : 'regenerate'} />}
    </Loaded>
  );
}

function Decide({ d, mode }: { d: DemandSheetDetail; mode: 'regenerate' | 'supplement' }) {
  const a = useAction();
  const qc = useQueryClient();
  const [done, setDone] = useState<{ heading: string; next: string }>();
  const sh = d.sheet;
  const regen = mode === 'regenerate';
  const title = regen ? 'Regenerate this sheet' : 'Add a supplementary sheet';
  const preview = useQuery({ queryKey: ['demand-topup-preview', mode, sh.id], queryFn: () => (regen ? api.demand.regeneratePreview(sh.id) : api.demand.supplementaryPreview(sh.cycle, sh.departmentId)) });
  const p = preview.data;
  const nothing = Boolean(p && !p.added.length && !p.removed.length);
  const submit = () =>
    void a.run(async () => {
      const { id } = await (regen ? api.demand.regenerate(sh.id) : api.demand.createSupplementary(sh.cycle, sh.departmentId));
      void qc.invalidateQueries({ queryKey: ['demand-overview'] });
      void qc.invalidateQueries({ queryKey: ['demand-sheet'] });
      void qc.invalidateQueries({ queryKey: ['work-queue'] });
      setDone({ heading: regen ? 'Sheet regenerated' : 'Supplementary sheet made', next: id });
    });

  if (done)
    return (
      <Screen
        header={<Header title={title} />}
        footer={<Button label={regen ? 'Done' : 'Open the new sheet'} size="lg" fullWidth onPress={() => (regen ? router.back() : router.replace(`/staff/demand/${done.next}`))} />}
      >
        <DoneAlert heading={done.heading} description={`${d.department?.name} · ${formatCycle(sh.cycle)}`} />
      </Screen>
    );

  return (
    <Screen
      header={<Header title={title} onBack={() => router.back()} />}
      footer={<Button label={regen ? 'Regenerate' : 'Make supplementary sheet'} size="lg" fullWidth loading={a.busy} disabled={!p || Boolean(p.blocked) || nothing || a.busy || a.unconfirmed} onPress={submit} />}
    >
      <Text type="body" tone="secondary">
        {regen
          ? "Rebuilds the member lines from today's records, so members the sheet missed are added. Allowed only before the sheet is certified, and while no payment is recorded on it."
          : "A new numbered sheet for members no sheet of this month has. The month's own sheet is not changed. It goes through Certify, Send to DDO, deductions and Post like any other."}
      </Text>
      {preview.isLoading ? <Text type="supporting" tone="secondary">Checking who is missing…</Text> : null}
      {p?.blocked ? <Banner status="warning" heading="Not possible now" description={p.blocked} /> : null}
      {p && !p.blocked ? (
        <>
          <Card>
            <MetadataListItem label={regen ? 'Demand now' : 'Added demand'} value={formatINR(regen ? p.oldTotal : p.newTotal)} />
            {regen ? <MetadataListItem label="Demand after" value={formatINR(p.newTotal)} emphasis /> : null}
          </Card>
          {nothing ? <Text type="body">Nobody is missing. The sheet already has everyone.</Text> : null}
          {p.added.length ? (
            <Section title={`Will be added (${p.added.length})`}>
              <Card>
                {p.added.map((m) => (
                  <MetadataListItem key={m.memberId} label={`${m.name} · No. ${m.generalNo}`} value={formatINR(m.demand)} />
                ))}
              </Card>
            </Section>
          ) : null}
          {p.removed.length ? (
            <Section title={`Will be removed (${p.removed.length})`}>
              <Card>
                {p.removed.map((m) => (
                  <MetadataListItem key={m.memberId} label={`${m.name} · No. ${m.generalNo}`} value="" />
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}
      <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check the sheet', href: `/staff/demand/${sh.id}` }} />
    </Screen>
  );
}
