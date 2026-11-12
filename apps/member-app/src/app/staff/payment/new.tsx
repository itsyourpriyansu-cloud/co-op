// ST-45m New receipt at the counter: member, what they owe, purpose and mode (cash slip, BR-029), live allocation.
// One Idempotency-Key per form (G1, D-111): a retry after a time-out returns the first receipt.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { allocateDuesPayment, amountInWords, formatCycle, formatINR } from '@tgs/domain';
import { newIdempotencyKey } from '@tgs/api-client';
import type { MemberPick, NewReceiptInput, ReceiptDetail } from '@tgs/types';
import { ActionAlert, ask, CashStatus, countsTotal, DenominationCounter, Loaded, MemberPicker, MoneyField, useAction, useCan, useTodayDate, type Counts } from '@/components/staff';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, ChoiceCard, DateField, Divider, Header, KeyValue, Screen, Section, Segmented, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function NewReceipt() {
  const { session } = useAuth();
  const can = useCan();
  const [member, setMember] = useState<MemberPick>();
  const dues = useQuery({ queryKey: ['dues', member?.id], queryFn: () => api.receipts.dues(member!.id), enabled: !!member });
  const [purpose, setPurpose] = useState<NewReceiptInput['purpose']>('DUES');
  const [recoveryId, setRecoveryId] = useState<string>();
  const [mode, setMode] = useState<NewReceiptInput['mode']>('CASH');
  const [amount, setAmount] = useState(Number.NaN);
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const { today, date, setDate } = useTodayDate();
  const a = useAction();
  const [idemKey] = useState(newIdempotencyKey);

  const recovery = dues.data?.suretyRecoveries?.find((r) => r.id === recoveryId);
  const owed = dues.data ? (purpose === 'DUES' ? dues.data.totalArrears : purpose === 'SURETY_RECOVERY' ? (recovery?.due ?? 0) : dues.data.shareCapitalDue) : 0;
  useEffect(() => {
    if (owed > 0) setAmount(owed);
    else setAmount(Number.NaN);
    setCounts({});
  }, [owed]);
  const amt = Number.isFinite(amount) ? amount : 0;

  const preview = useMemo(() => {
    if (!dues.data || purpose !== 'DUES' || !(amt > 0)) return [];
    // R4 (D-088): penal first, then the instalments in the agreement's order.
    const r = allocateDuesPayment(dues.data.arrears.map((x) => ({ key: x.cycle, penal: x.penal, components: x.components })), amt);
    return r.cycles.flatMap((c, i) => [{ cycle: c.key, label: 'Penal interest', delta: c.penalPaid }, ...c.components.map((x, j) => ({ cycle: c.key, label: dues.data!.arrears[i]!.components[j]!.label, delta: x.allocated - dues.data!.arrears[i]!.components[j]!.allocated }))]).filter((x) => x.delta > 0);
  }, [dues.data, purpose, amt]);

  const ready = amt > 0 && !!date && (mode !== 'CASH' || countsTotal(counts) === amt) && (mode !== 'BANK_TRANSFER' || !!reference.trim());
  const save = async () => {
    if (!(await ask('Save receipt', `${formatINR(amt)} from ${member!.name}. This posts to the ledger and cannot be undone here.`, 'Save receipt'))) return;
    let saved: ReceiptDetail | undefined;
    const ok = await a.run(async () => {
      saved = await api.receipts.create({ memberId: member!.id, purpose, ...(purpose === 'SURETY_RECOVERY' && recoveryId ? { recoveryId } : {}), mode, amount: amt, date: date!, ...(mode === 'CASH' ? { denominations: counts } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, idemKey);
    });
    if (ok && saved) router.replace(`/staff/payment/${saved.receipt.id}`);
  };
  const penal = dues.data?.arrears.reduce((s, x) => s + x.penal, 0) ?? 0;
  const purposes: Array<{ value: NewReceiptInput['purpose']; title: string; hint: string; off: boolean }> = dues.data
    ? [
        { value: 'DUES', title: 'Dues', hint: dues.data.totalArrears ? `${formatINR(dues.data.totalArrears)} unpaid` : 'Nothing unpaid', off: !dues.data.totalArrears },
        { value: 'SHARE_CAPITAL', title: 'Share capital', hint: dues.data.shareCapitalDue ? `${formatINR(dues.data.shareCapitalDue)} due` : 'Fully paid', off: !dues.data.shareCapitalDue },
        ...(dues.data.suretyRecoveries?.length ? [{ value: 'SURETY_RECOVERY' as const, title: 'As surety', hint: `${formatINR(dues.data.suretyRecoveries.reduce((s, r) => s + r.due, 0))} for other members' loans`, off: false }] : []),
      ]
    : [];

  return (
    <Screen
      header={<Header title="New receipt" onBack={() => router.back()} />}
      {...(member && dues.data
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                {mode === 'CASH' && amt > 0 ? <CashStatus amount={amt} counts={counts} /> : null}
                <Button text={`Save receipt${amt > 0 ? ` · ${formatINR(amt)}` : ''}`} size="lg" fullWidth disabled={!ready || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />
              </View>
            ),
          }
        : {})}
    >
      <MemberPicker value={member} onPick={(m) => (setMember(m), setPurpose('DUES'), setRecoveryId(undefined))} error={a.fields.memberId} />
      {member ? (
        <Loaded q={dues} what="this member's dues">
          {(du) => (
            <>
              <Section title="What they owe" description="Unpaid from posted demand sheets">
                <Card>
                  {du.arrears.map((x, i) => (
                    <View key={x.cycle} style={{ gap: space[1] }}>
                      {i ? <Divider /> : null}
                      <KeyValue label={formatCycle(x.cycle)} value={formatINR(x.unpaid + x.penal)} emphasis />
                      {x.penal > 0 ? (
                        <Text role="caption" tone="danger">
                          Penal interest (to today) {formatINR(x.penal)}
                        </Text>
                      ) : null}
                      {x.penalWaived ? (
                        <Text role="caption" tone="tertiary">
                          Penal waived so far: {formatINR(x.penalWaived)}
                        </Text>
                      ) : null}
                      {x.components
                        .filter((c) => c.unpaid > 0)
                        .map((c, j) => (
                          <Text key={j} role="caption" tone="secondary">
                            {c.label} {formatINR(c.unpaid)}
                          </Text>
                        ))}
                    </View>
                  ))}
                  {du.shareCapitalDue > 0 ? <KeyValue label="Share capital (first demand)" value={formatINR(du.shareCapitalDue)} emphasis /> : null}
                  {!du.arrears.length && !du.shareCapitalDue ? (
                    <Text role="caption" tone="success">
                      Nothing unpaid. Every posted month was recovered in full.
                    </Text>
                  ) : null}
                </Card>
                {penal > 0 && can('collections.waivePenal') ? <Button text="Waive penal interest" buttonType="secondary" fullWidth onPress={() => router.push(`/staff/member/${member.id}/waive`)} /> : null}
              </Section>

              <Section title="For">
                <View style={{ gap: space[4] }}>
                  {purposes.map((p) => (
                    <ChoiceCard key={p.value} title={p.title} description={p.hint} selected={purpose === p.value} onPress={() => !p.off && setPurpose(p.value)} />
                  ))}
                  {purpose === 'SURETY_RECOVERY'
                    ? du.suretyRecoveries?.map((r) => <ChoiceCard key={r.id} title={`${r.borrowerName} · ${r.loanNo}`} description={`${formatINR(r.due)} due`} selected={recoveryId === r.id} onPress={() => r.due > 0 && setRecoveryId(r.id)} />)
                    : null}
                </View>
                {a.fields.recoveryId || a.fields.purpose ? (
                  <Text role="caption" tone="danger">
                    {a.fields.recoveryId ?? a.fields.purpose}
                  </Text>
                ) : null}
              </Section>

              <Segmented label="Received as" value={mode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK_TRANSFER', label: 'Bank' }, ...(session?.user.role === 'ACCOUNTANT' ? [{ value: 'ADJUSTMENT' as const, label: 'Adjustment' }] : [])]} onChange={(v) => setMode(v as NewReceiptInput['mode'])} error={a.fields.mode} />
              <MoneyField label="Amount" required value={amount} onChange={setAmount} error={a.fields.amount} hint={amt > 0 ? amountInWords(amt) : undefined} />
              <DateField key={today} label="Date received" required value={date} onChange={setDate} error={a.fields.date} />
              {mode === 'CASH' && amt > 0 ? <DenominationCounter amount={amt} counts={counts} onChange={setCounts} /> : null}
              {a.fields.denominations ? (
                <Text role="caption" tone="danger">
                  {a.fields.denominations}
                </Text>
              ) : null}
              {mode === 'BANK_TRANSFER' ? <TextField label="UTR / reference" required value={reference} onChangeText={setReference} error={a.fields.reference} /> : null}
              {mode === 'ADJUSTMENT' ? <TextField label="Why (recorded on the receipt)" required value={remarks} onChangeText={setRemarks} multiline numberOfLines={2} placeholder="e.g. Adjusted from the share deposit refund on committee approval." error={a.fields.remarks} /> : null}

              {preview.length ? (
                <Section title="This receipt pays">
                  <Card>
                    {preview.map((p, i) => (
                      <KeyValue key={i} label={`${formatCycle(p.cycle)} · ${p.label}`} value={formatINR(p.delta)} />
                    ))}
                  </Card>
                </Section>
              ) : null}
              <ActionAlert action={a} heading="Couldn't save" check={{ text: 'Check Payments', href: '/staff/payments' }} />
            </>
          )}
        </Loaded>
      ) : null}
    </Screen>
  );
}
