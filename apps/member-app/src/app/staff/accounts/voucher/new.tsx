// ST-48m New voucher (G2, D-112): a payment (expense) or receipt (other income) by cash or bank.
// One Idempotency-Key per form, so a retry after a time-out cannot post it twice.
import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { newIdempotencyKey } from '@tgs/api-client';
import { amountInWords, formatINR } from '@tgs/domain';
import type { OfficeVoucher, OfficeVoucherInput } from '@tgs/types';
import { ActionAlert, ask, MoneyField, useAction, useTodayDate } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, DateField, Header, Screen, Segmented, SelectField, TextField } from '@/ui';

export default function NewVoucher() {
  const heads = useQuery({ queryKey: ['ledger-heads'], queryFn: api.accounts.heads });
  const [kind, setKind] = useState<OfficeVoucherInput['kind']>('PAYMENT');
  const [headCode, setHeadCode] = useState('');
  const [amount, setAmount] = useState(Number.NaN);
  const [mode, setMode] = useState<OfficeVoucherInput['mode']>('CASH');
  const [reference, setReference] = useState('');
  const [party, setParty] = useState('');
  const [narration, setNarration] = useState('');
  const { today, date, setDate } = useTodayDate();
  const a = useAction();
  const [idemKey] = useState(newIdempotencyKey);
  const amt = Number.isFinite(amount) ? amount : 0;
  const options = (heads.data ?? []).filter((h) => h.active && h.type === (kind === 'PAYMENT' ? 'EXPENSE' : 'INCOME')).map((h) => ({ value: h.code, label: `${h.code} ${h.name}` }));
  const ready = !!headCode && amt > 0 && party.trim().length > 1 && narration.trim().length > 2 && (mode === 'CASH' || !!reference.trim());

  const save = async () => {
    if (!(await ask(kind === 'PAYMENT' ? 'Save payment' : 'Save receipt', `${formatINR(amt)} ${kind === 'PAYMENT' ? 'paid to' : 'received from'} ${party.trim()}. This posts to the books.`, 'Save'))) return;
    let saved: OfficeVoucher | undefined;
    const ok = await a.run(async () => {
      saved = await api.accounts.createVoucher({ kind, headCode, amount: amt, mode, ...(mode === 'BANK' ? { reference: reference.trim() } : {}), party: party.trim(), narration: narration.trim(), ...(date ? { date } : {}) }, idemKey);
    });
    if (ok && saved) router.replace(`/staff/accounts/voucher/${saved.id}`);
  };

  return (
    <Screen header={<Header title="New voucher" onBack={() => router.back()} />} footer={<Button text={`Save${amt > 0 ? ` · ${formatINR(amt)}` : ''}`} size="lg" fullWidth disabled={!ready || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />}>
      <Segmented
        label="Kind"
        value={kind}
        options={[
          { value: 'PAYMENT', label: 'Payment' },
          { value: 'RECEIPT', label: 'Receipt' },
        ]}
        onChange={(k) => (setKind(k), setHeadCode(''))}
      />
      <SelectField label={kind === 'PAYMENT' ? 'Expense head' : 'Income head'} required searchable value={headCode} options={options} onChange={setHeadCode} error={a.fields.headCode} />
      <MoneyField label="Amount" required value={amount} onChange={setAmount} error={a.fields.amount} hint={amt > 0 ? amountInWords(amt) : undefined} />
      <Segmented
        label="Paid by"
        value={mode}
        options={[
          { value: 'CASH', label: 'Cash' },
          { value: 'BANK', label: 'Bank' },
        ]}
        onChange={setMode}
        error={a.fields.mode}
      />
      {mode === 'BANK' ? <TextField label="Cheque or transfer reference" required value={reference} onChangeText={setReference} error={a.fields.reference} autoCapitalize="characters" /> : null}
      <TextField label={kind === 'PAYMENT' ? 'Paid to' : 'Received from'} required value={party} onChangeText={setParty} error={a.fields.party} />
      <TextField label="What it is for" required value={narration} onChangeText={setNarration} error={a.fields.narration} placeholder="e.g. Stationery for October" />
      <DateField key={today} label="Date" required value={date} onChange={setDate} error={a.fields.date} />
      <ActionAlert action={a} check={{ text: 'Check the vouchers', href: '/staff/accounts' }} />
    </Screen>
  );
}
