// R5 (D-088): waive penal interest on one month, with a reason (permission collections.waivePenal).
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react-native';
import { formatCycle, formatINR } from '@tgs/domain';
import { ActionAlert, ask, Loaded, MoneyField, useAction, useCan } from '@/components/staff';
import { api } from '@/lib/api';
import { Alert, Button, ChoiceCard, EmptyState, Header, Screen, Section, Text, TextField } from '@/ui';

export default function WaivePenal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const q = useQuery({ queryKey: ['dues', id], queryFn: () => api.receipts.dues(id) });
  const [sheetId, setSheetId] = useState<string>();
  const [amount, setAmount] = useState(Number.NaN);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string>();
  const a = useAction();
  const months = (q.data?.arrears ?? []).filter((x) => x.penal > 0);
  const sel = months.find((x) => x.sheetId === sheetId);
  const ready = !!sel && amount > 0 && reason.trim().length >= 10 && !a.busy && !a.unconfirmed;

  const save = async () => {
    if (!sel || !(await ask(`Waive penal for ${formatCycle(sel.cycle)}?`, `${formatINR(amount)} of ${formatINR(sel.penal)}. The original and waived amounts and your reason are kept in the audit trail.`, 'Waive'))) return;
    const ok = await a.run(() => api.receipts.waivePenal(id, { sheetId: sel.sheetId, amount, reason: reason.trim() }));
    if (ok) {
      setNote(`Waived ${formatINR(amount)} for ${formatCycle(sel.cycle)}`);
      setSheetId(undefined);
      setAmount(Number.NaN);
      setReason('');
    }
  };

  return (
    <Screen header={<Header title="Waive penal interest" onBack={() => router.back()} />} {...(months.length && can('collections.waivePenal') ? { footer: <Button text="Waive" size="lg" fullWidth loading={a.busy} disabled={!ready} onPress={() => void save()} /> } : {})}>
      {note ? <Alert type="success" heading={note} /> : null}
      {!can('collections.waivePenal') ? (
        <Alert type="warning" heading="You can't waive penal interest" description="Ask someone with the waiver permission." />
      ) : (
        <Loaded q={q} what="this member's dues">
          {() =>
            !months.length ? (
              <EmptyState icon={HandCoins} title="No penal interest to waive" />
            ) : (
              <>
                <Section title="Month">
                  {months.map((x) => (
                    <ChoiceCard
                      key={x.sheetId}
                      title={formatCycle(x.cycle)}
                      description={`Owed today ${formatINR(x.penal)}${x.penalWaived ? ` · waived so far ${formatINR(x.penalWaived)}` : ''}`}
                      selected={sheetId === x.sheetId}
                      onPress={() => {
                        setSheetId(x.sheetId);
                        setAmount(x.penal);
                      }}
                    />
                  ))}
                </Section>
                {sel ? <MoneyField label="Amount to waive" required value={amount} onChange={setAmount} error={a.fields.amount} /> : null}
                {sel ? <TextField label="Reason" required value={reason} onChangeText={setReason} multiline numberOfLines={2} placeholder="e.g. Delay caused by the department's late pay bill" hint="At least 10 characters." error={a.fields.reason} /> : null}
                <Text role="caption" tone="tertiary">
                  Recorded with your name and time.
                </Text>
              </>
            )
          }
        </Loaded>
      )}
      <ActionAlert action={a} heading="Not waived" check={{ text: 'Check the member', href: `/staff/member/${id}` }} />
    </Screen>
  );
}
