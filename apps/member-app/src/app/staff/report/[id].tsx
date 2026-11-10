// ST-51m Report viewer (J-13): filters → GET /reports/:id → grouped cards with subtotals, the grand total first.
// CSV goes to the share sheet; Print opens the console's copy on the letterhead (D-106).
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileSearch, UserRound } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { formatCycle, formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import type { MemberPick, ReportCell, ReportColumn, ReportFilterKey, ReportResult } from '@tgs/types';
import { Expand, MemberPicker, PrintButton, ShareCsvButton, staffHref } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, Card, DateField, EmptyState, Header, KeyValue, Screen, Section, SelectField, Skeleton, Text } from '@/ui';
import { space } from '@/theme';

function show(c: ReportColumn, v: ReportCell): string {
  if (v === null || v === undefined || v === '') return '—';
  if (c.type === 'money') return v === 0 ? '–' : formatINR(Number(v));
  if (c.type === 'percent') return `${(Number(v) * 100).toFixed(1)}%`;
  if (c.type === 'date') return formatDisplayDate(String(v));
  if (c.type === 'cycle') return formatCycle(String(v));
  if (c.type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
}

function csvRows(res: ReportResult) {
  const grouped = res.groups.some((g) => g.label);
  const head = [...(grouped ? ['Group'] : []), ...res.columns.map((c) => c.label)];
  const cell = (c: ReportColumn, v: ReportCell) => (c.type === 'money' ? Number(v ?? 0) / 100 : c.type === 'percent' ? Number((Number(v ?? 0) * 100).toFixed(2)) : (v ?? ''));
  const rows: Array<Array<string | number>> = [[res.def.title], [res.filterLabels.join(' · ')], [`Generated ${formatDisplayDateTime(res.generatedAt)} · amounts in rupees`], [], head];
  for (const g of res.groups) {
    for (const row of g.rows) rows.push([...(grouped ? [g.label] : []), ...res.columns.map((c) => cell(c, row[c.key] ?? null))]);
    if (grouped) rows.push([`${g.label} subtotal`, ...res.columns.map((c) => (c.total ? cell(c, g.subtotal[c.key] ?? 0) : ''))]);
  }
  rows.push([...(grouped ? ['Total'] : []), ...res.columns.map((c, i) => (c.total ? cell(c, res.totals[c.key] ?? 0) : !grouped && i === 0 ? 'Total' : ''))]);
  return rows;
}

function Rows({ r, rows }: { r: ReportResult; rows: ReportResult['groups'][number]['rows'] }) {
  const [shown, setShown] = useState(30);
  const [first, ...rest] = r.columns;
  return (
    <View style={{ gap: space[4] }}>
      {rows.slice(0, shown).map((row, i) => {
        const link = r.links?.[String(row[first!.key] ?? '')];
        return (
          <Card key={i} {...(link ? { onPress: () => router.push(staffHref(link)) } : {})}>
            <Text role="label" tone={link ? 'link' : 'primary'}>
              {show(first!, row[first!.key] ?? null)}
            </Text>
            {rest.map((c) => (
              <KeyValue key={c.key} label={c.label} value={show(c, row[c.key] ?? null)} />
            ))}
          </Card>
        );
      })}
      {rows.length > shown ? <Button text={`Show more (${rows.length - shown} left)`} buttonType="secondary" fullWidth onPress={() => setShown((s) => s + 50)} /> : null}
    </View>
  );
}

function Result({ r }: { r: ReportResult }) {
  const totalled = r.columns.filter((c) => c.total);
  const grouped = r.groups.some((g) => g.label);
  return (
    <>
      <Text role="caption" tone="secondary">
        {r.filterLabels.join(' · ') || 'All records'}
        {'\n'}
        {r.rowCount.toLocaleString('en-IN')} row{r.rowCount === 1 ? '' : 's'} · as of {formatDisplayDate(r.asOf)} · generated {formatDisplayDateTime(r.generatedAt)}
      </Text>
      {totalled.length ? (
        <Section title="Grand total">
          <Card>
            {totalled.map((c) => (
              <KeyValue key={c.key} label={c.label} value={show(c, r.totals[c.key] ?? 0)} emphasis />
            ))}
          </Card>
        </Section>
      ) : null}
      {grouped ? (
        r.groups.map((g, i) => (
          <Expand key={g.label} title={`${g.label} · ${g.rows.length} row${g.rows.length === 1 ? '' : 's'}`} initiallyOpen={i === 0}>
            {totalled.length ? (
              <Card>
                <Text role="overline" tone="tertiary">
                  Subtotal
                </Text>
                {totalled.map((c) => (
                  <KeyValue key={c.key} label={c.label} value={show(c, g.subtotal[c.key] ?? 0)} />
                ))}
              </Card>
            ) : null}
            <Rows r={r} rows={g.rows} />
          </Expand>
        ))
      ) : (
        <Rows r={r} rows={r.groups[0]?.rows ?? []} />
      )}
    </>
  );
}

export default function ReportViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [filters, setFilters] = useState<Partial<Record<ReportFilterKey, string>>>({});
  const [member, setMember] = useState<MemberPick>();
  const cat = useQuery({ queryKey: ['reports'], queryFn: api.reports.catalogue });
  const def = cat.data?.reports.find((r) => r.id === id);
  const opts = cat.data?.options;
  const needsMember = !!def?.filters.includes('memberId') && !filters.memberId;
  const q = useQuery({ queryKey: ['report', id, filters], queryFn: () => api.reports.run(id, filters), enabled: !!def?.available && !needsMember, retry: false });
  const r = q.data;
  const has = (k: ReportFilterKey) => !!def?.filters.includes(k);
  const set = (k: ReportFilterKey, v?: string) =>
    setFilters((f) => {
      const next = { ...f };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });
  const clear = () => {
    setFilters({});
    setMember(undefined);
  };
  const errorMsg = q.error && isApiError(q.error) ? (Object.values(q.error.fieldErrors ?? {})[0] ?? q.error.message) : undefined;
  const qs = new URLSearchParams(filters as Record<string, string>).toString();

  return (
    <Screen header={<Header title={def?.title ?? 'Report'} onBack={() => router.back()} />}>
      {def?.description ? (
        <Text role="body" tone="secondary">
          {def.description}
        </Text>
      ) : null}
      {def && opts ? (
        <View style={{ gap: space[6] }}>
          {has('memberId') ? <MemberPicker value={member} onPick={(m) => (setMember(m), set('memberId', m?.id))} /> : null}
          {has('cycle') ? <SelectField label="Month" placeholder="Latest posted" value={filters.cycle ?? r?.filters.cycle ?? ''} options={opts.cycles.map((c) => ({ value: c, label: formatCycle(c) }))} onChange={(v) => set('cycle', v)} /> : null}
          {has('departmentId') ? <SelectField label="Department" searchable value={filters.departmentId ?? ''} options={[{ value: '', label: 'All departments' }, ...opts.departments.map((d) => ({ value: d.id, label: d.name }))]} onChange={(v) => set('departmentId', v || undefined)} /> : null}
          {has('product') ? <SelectField label="Loan type" value={filters.product ?? ''} options={[{ value: '', label: 'All loan types' }, ...opts.products.map((p) => ({ value: p.code, label: p.name }))]} onChange={(v) => set('product', v || undefined)} /> : null}
          {has('minCycles') ? <SelectField label="Short in a row" value={filters.minCycles ?? String(opts.defaulterCycles)} options={['1', '2', '3', '4', '6'].map((n) => ({ value: n, label: `${n}+ cycle${n === '1' ? '' : 's'}${Number(n) === opts.defaulterCycles ? ' (setting)' : ''}` }))} onChange={(v) => set('minCycles', v)} /> : null}
          {has('withinMonths') ? <SelectField label="Retiring within" value={filters.withinMonths ?? '12'} options={['3', '6', '12', '24', '36'].map((n) => ({ value: n, label: `${n} months` }))} onChange={(v) => set('withinMonths', v)} /> : null}
          {/* Remounts once when the server's default arrives; DateField keeps its own text after that. */}
          {has('from') ? <DateField key={`from-${filters.from ? 'set' : (r?.filters.from ?? '')}`} label="From" value={filters.from ?? r?.filters.from} onChange={(d) => d && set('from', d)} /> : null}
          {has('to') ? <DateField key={`to-${filters.to ? 'set' : (r?.filters.to ?? '')}`} label="To" value={filters.to ?? r?.filters.to} onChange={(d) => d && set('to', d)} error={errorMsg?.includes('start') ? errorMsg : undefined} /> : null}
          {Object.keys(filters).length ? <Button text="Clear filters" subType="inline" style={{ alignSelf: 'flex-start' }} onPress={clear} /> : null}
        </View>
      ) : null}

      {cat.isLoading || q.isLoading ? (
        <Skeleton height={200} />
      ) : cat.data && !def ? (
        <EmptyState icon={FileSearch} title="Report not found" description="Pick a report from the catalogue." action={{ text: 'All reports', onPress: () => router.back() }} />
      ) : def && !def.available ? (
        <EmptyState icon={FileSearch} title={`${def.title} is not available yet`} {...(def.note ? { description: def.note } : {})} />
      ) : needsMember ? (
        <EmptyState icon={UserRound} title="Choose a member" description="Search for the member whose ledger you want to see." />
      ) : q.isError ? (
        <Alert type={isApiError(q.error) && q.error.code === 'VALIDATION_ERROR' ? 'warning' : 'error'} heading="Couldn't run this report" description={errorMsg ?? 'Check your connection and try again.'} action={{ text: 'Try again', onPress: () => void q.refetch() }} />
      ) : r && r.rowCount === 0 ? (
        <EmptyState icon={FileSearch} title="Nothing matches these filters" action={{ text: 'Clear filters', onPress: clear }} />
      ) : r ? (
        <>
          <Result r={r} />
          <View style={{ gap: space[3] }}>
            <ShareCsvButton title={r.def.title} rows={() => csvRows(r)} />
            <PrintButton path={`/reports/${id}${qs ? `?${qs}` : ''}`} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
