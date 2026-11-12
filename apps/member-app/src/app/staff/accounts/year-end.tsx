// ST-48m Year end (G2, D-112): annual interest on share deposit / CRD / SRDS, closing the year
// (income and expenses to the surplus, then locked) and the dividend the general body approves.
import { useState } from 'react';
import { router } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ActionAlert, ask, DoneAlert, Loaded, useAction, useCan } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, SelectField, Text, TextField } from '@/ui';

export default function YearEnd() {
  const can = useCan();
  const [fy, setFy] = useState<string>();
  const q = useQuery({ queryKey: ['year-end', fy], queryFn: () => api.accounts.yearEnd(fy) });
  const year = fy ?? q.data?.fy ?? '';
  const interest = useQuery({ queryKey: ['year-interest', year], queryFn: () => api.accounts.interestPreview(year), enabled: Boolean(year) });
  const [rate, setRate] = useState('');
  const [resolution, setResolution] = useState('');
  const rateNum = Number(rate) || 0;
  const dividend = useQuery({ queryKey: ['year-dividend', year, rateNum], queryFn: () => api.accounts.dividendPreview(year, rateNum), enabled: Boolean(year && q.data?.closed), placeholderData: keepPreviousData });
  const a = useAction();
  const allowed = can('ledger.close');

  return (
    <Screen header={<Header title="Year end" onBack={() => router.back()} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Loaded page q={q} what="the year">
        {(s) => {
          const ip = interest.data;
          const dp = dividend.data;
          const run = async (title: string, msg: string, work: () => Promise<unknown>) => {
            if (await ask(title, msg, 'Go ahead')) await a.run(work);
          };
          return (
            <>
              <SelectField label="Financial year" value={year} options={s.years.map((y) => ({ value: y, label: y }))} onChange={setFy} />
              <Text role="caption" tone="secondary">
                {formatDisplayDate(s.from)} – {formatDisplayDate(s.to)} · {s.closed ? `closed by ${s.closed.closedByName}, ${formatDisplayDateTime(s.closed.closedAt)}` : 'open'}
              </Text>
              <Card>
                <KeyValue label="Income" value={formatINR(s.income)} />
                <KeyValue label="Expenses" value={formatINR(s.expense)} />
                <Divider />
                <KeyValue label={s.surplus >= 0 ? 'Surplus' : 'Deficit'} value={formatINR(Math.abs(s.surplus))} emphasis />
              </Card>

              <Section title="1. Annual interest" description={ip ? `Share deposit ${ip.rates.SHARE_DEPOSIT}% · CRD ${ip.rates.CRD}% · SRDS ${ip.rates.SRDS}% · ${ip.basis === 'YEAR_END' ? 'year-end balance' : 'average of month-ends'}` : 'Rates are in Settings → Deposits'}>
                {ip ? (
                  <Card>
                    <KeyValue label="Share deposit" value={formatINR(ip.totals.SHARE_DEPOSIT)} />
                    <KeyValue label="CRD" value={formatINR(ip.totals.CRD)} />
                    <KeyValue label="SRDS" value={formatINR(ip.totals.SRDS)} />
                    <Divider />
                    <KeyValue label={`${new Set(ip.rows.map((r) => r.memberId)).size} members`} value={formatINR(ip.totals.all)} emphasis />
                  </Card>
                ) : null}
                {ip?.posted ? (
                  <DoneAlert heading="Interest credited" description={ip.posted.entryNo} />
                ) : allowed && !s.closed && ip ? (
                  <>
                    {s.to >= s.today ? <Alert type="neutral" heading={`Credited after ${formatDisplayDate(s.to)}`} description="The year has not ended yet." /> : null}
                    <Button text="Credit the interest" fullWidth disabled={s.to >= s.today || !ip.rows.length} loading={a.busy} onPress={() => void run(`Credit interest for ${year}?`, `${formatINR(ip.totals.all)} goes to members' accounts, dated ${formatDisplayDate(s.to)}. This is done once.`, () => api.accounts.postInterest(year))} />
                  </>
                ) : null}
              </Section>

              <Section title="2. Close the year" description="Income and expenses go to the surplus; nothing more can be dated in the year.">
                {s.closed ? (
                  <DoneAlert heading="Year closed" description={`${s.closed.surplus >= 0 ? 'Surplus' : 'Deficit'} ${formatINR(Math.abs(s.closed.surplus))}`} />
                ) : (
                  <>
                    {s.blockers.map((b) => (
                      <Text key={b} role="caption" tone="secondary">
                        • {b}
                      </Text>
                    ))}
                    {!s.interestPosted && s.canClose ? <Alert type="warning" heading="Interest not credited yet" /> : null}
                    {allowed ? <Button text="Close the year" buttonType="danger" fullWidth disabled={!s.canClose} loading={a.busy} onPress={() => void run(`Close ${year}?`, `Income and expenses move to the surplus and nothing can be dated on or before ${formatDisplayDate(s.to)} after this.`, () => api.accounts.closeYear(year))} /> : null}
                  </>
                )}
              </Section>

              {s.closed ? (
                <Section title="3. Dividend" description="On each member's share capital at the year end, at the rate the general body approved.">
                  {s.dividend ? (
                    <>
                      <DoneAlert heading={`${s.dividend.ratePercent}% declared`} description={`${s.dividend.entryNo} · ${formatINR(s.dividend.total)}${s.dividend.paid ? ' · paid' : ''}`} />
                      {!s.dividend.paid && allowed ? <Button text="Pay from the bank" fullWidth loading={a.busy} onPress={() => void run('Pay the dividend?', "One bank payment entry for every member's declared dividend.", () => api.accounts.payDividend(year))} /> : null}
                    </>
                  ) : allowed ? (
                    <>
                      <TextField label="Rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="%" error={a.fields.ratePercent} />
                      <TextField label="General body resolution" value={resolution} onChangeText={setResolution} placeholder="e.g. Res. 4 of 20 Jun 2027" error={a.fields.resolution} />
                      {dp && rateNum > 0 ? (
                        <Text role="caption" tone="secondary">
                          {dp.rows.length} members · {formatINR(dp.total)}
                        </Text>
                      ) : null}
                      <Button text="Declare" fullWidth disabled={!(rateNum > 0)} loading={a.busy} onPress={() => void run(`Declare ${rateNum}% dividend?`, `${formatINR(dp?.total ?? 0)} becomes payable to members out of the surplus.`, () => api.accounts.declareDividend({ fy: year, ratePercent: rateNum, resolution: resolution.trim() }))} />
                    </>
                  ) : null}
                </Section>
              ) : null}
              <ActionAlert action={a} />
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
