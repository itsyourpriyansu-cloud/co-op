// G1 (D-111, BR-040): take the payment that closes a loan early. The amount is fixed by the server's
// quote (principal + interest to today); cash is counted in notes, with coins for what notes cannot make.
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { newIdempotencyKey } from '@tgs/api-client';
import { amountInWords, formatDisplayDate, formatINR } from '@tgs/domain';
import type { LoanClosureInput, LoanClosureQuote, ReceiptDetail } from '@tgs/types';
import { ActionAlert, ask, CashStatus, countsTotal, DenominationCounter, Loaded, useAction, type Counts } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, Card, Header, MetadataListItem, Screen, Section, SegmentedControl, Text, TextField } from '@/ui';
import { spacing } from '@/theme';

export default function CloseLoan() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['loan-closure', id], queryFn: () => api.receipts.closureQuote(id) });
  return (
    <Loaded page q={q} what="the closing amount">
      {(p) => <Body p={p} />}
    </Loaded>
  );
}

function Body({ p }: { p: LoanClosureQuote }) {
  const a = useAction();
  const [mode, setMode] = useState<LoanClosureInput['mode']>('CASH');
  const [counts, setCounts] = useState<Counts>({});
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [idemKey] = useState(newIdempotencyKey);
  const coins = p.total % 1000;
  const notes = p.total - coins;
  const ready = p.canClose && (mode === 'CASH' ? countsTotal(counts) === notes : !!reference.trim());

  const save = async () => {
    if (!(await ask(`Close ${p.loanNo}`, `${formatINR(p.total)} from ${p.memberName}. This posts to the ledger and closes the loan.`, 'Close the loan'))) return;
    let saved: ReceiptDetail | undefined;
    const ok = await a.run(async () => {
      saved = await api.receipts.closeLoan(p.loanId, { mode, amount: p.total, ...(mode === 'CASH' ? { denominations: counts, ...(coins ? { coins } : {}) } : { reference: reference.trim() }), ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, idemKey);
    });
    if (ok && saved) router.replace(`/staff/payment/${saved.receipt.id}`);
  };

  return (
    <Screen
      header={<Header title="Close loan early" onBack={() => router.back()} />}
      {...(p.canClose
        ? {
            footer: (
              <View style={{ gap: spacing[1.5] }}>
                {mode === 'CASH' ? <CashStatus amount={notes} counts={counts} /> : null}
                <Button label={`Save receipt · ${formatINR(p.total)}`} size="lg" fullWidth disabled={!ready || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />
              </View>
            ),
          }
        : {})}
    >
      <View style={{ gap: spacing[1] }}>
        <Text type="h1">{p.loanNo}</Text>
        <Text type="supporting" tone="secondary">
          {p.memberName} · No. {p.generalNo}
        </Text>
      </View>
      <Section title="To close today" description={`As of ${formatDisplayDate(p.asOf)}`}>
        <Card>
          <MetadataListItem label="Principal outstanding" value={formatINR(p.principal)} />
          <MetadataListItem label={`Interest from ${formatDisplayDate(p.interestFrom)} · ${p.ratePercent}% a year`} value={formatINR(p.interest)} />
          <MetadataListItem label="Total" value={formatINR(p.total)} emphasis />
          <Text type="supporting" tone="secondary">
            {amountInWords(p.total)}
          </Text>
        </Card>
      </Section>
      {p.blockers.map((b) => (
        <Text key={b} type="body" tone="warning">
          {b}
        </Text>
      ))}
      {p.canClose ? (
        <>
          {p.draftCycles.length ? (
            <Text type="supporting" tone="secondary">
              The instalment comes off the draft demand for {p.draftCycles.join(', ')}.
            </Text>
          ) : null}
          <SegmentedControl label="Received as" value={mode} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK_TRANSFER', label: 'Bank' }]} onChange={(v) => setMode(v as LoanClosureInput['mode'])} error={a.fields.mode} />
          {mode === 'CASH' ? (
            <>
              <DenominationCounter amount={notes} counts={counts} onChange={setCounts} />
              {coins ? (
                <Text type="supporting" tone="secondary">
                  Plus {formatINR(coins)} in coins, which notes cannot make.
                </Text>
              ) : null}
              {a.fields.denominations ? (
                <Text type="supporting" tone="error">
                  {a.fields.denominations}
                </Text>
              ) : null}
            </>
          ) : (
            <TextField label="UTR / reference" required value={reference} onChangeText={setReference} error={a.fields.reference} />
          )}
          <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline numberOfLines={2} />
          <ActionAlert action={a} heading="Couldn't close the loan" check={{ text: 'Check Payments', href: '/staff/payments' }} />
        </>
      ) : null}
    </Screen>
  );
}
