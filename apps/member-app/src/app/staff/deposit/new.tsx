// ST-31m Open an FD at the counter (form F4): member, deposit, holders, nominee. The Cashier then records the payment.
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { amountInWords, calculateFdMaturity, fdRateFor, formatDisplayDate, formatINR, validateFdRequest } from '@tgs/domain';
import type { DepositDetail, FdHolder, FdRequestInput, MemberPick } from '@tgs/types';
import { ActionAlert, Filter, MemberPicker, MoneyField, useAction, useToday } from '@/components/staff';
import { api } from '@/lib/api';
import { blankHolder, PAYOUTS } from '@/lib/staffDeposits';
import { Alert, Button, Card, DateField, Header, KeyValue, Screen, Section, Segmented, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function NewDeposit() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get, staleTime: 5 * 60_000 });
  const today = useToday();
  const [member, setMember] = useState<MemberPick>();
  const profile = useQuery({ queryKey: ['member', member?.id], queryFn: () => api.members.get(member!.id), enabled: !!member });
  const [v, setV] = useState<FdRequestInput>({ principal: Number.NaN, tenureMonths: 24, payoutFrequency: 'ON_MATURITY', holding: 'SINGLE', nominee: { name: '', relation: 'Spouse' } });
  const [showErrors, setShowErrors] = useState(false);
  const a = useAction();
  const set = (p: Partial<FdRequestInput>) => setV((x) => ({ ...x, ...p }));

  // Nominee defaults from the member master (F4 item 9).
  useEffect(() => {
    const n = profile.data?.member.nominee;
    if (n) setV((x) => ({ ...x, nominee: { name: n.name, relation: n.relation } }));
  }, [profile.data]);

  const s = settings.data?.settings;
  const rate = s ? fdRateFor(v.tenureMonths, s.fdSlabs) : undefined;
  const clean = { ...v, principal: Number.isFinite(v.principal) ? v.principal : 0 };
  const local = s ? validateFdRequest(clean, { slabs: s.fdSlabs, minAmount: s.fdMinAmount, today }) : {};
  const mat = useMemo(() => (rate && clean.principal > 0 ? calculateFdMaturity({ principal: clean.principal, ratePercent: rate, tenureMonths: v.tenureMonths, payout: v.payoutFrequency, openedOn: today }) : undefined), [rate, clean.principal, v.tenureMonths, v.payoutFrequency, today]);
  const errors: Record<string, string> = showErrors ? { ...local, ...a.fields } : {};
  const holders = v.holders ?? [];
  const setHolder = (i: number, p: Partial<FdHolder>) => set({ holders: holders.map((h, j) => (j === i ? { ...h, ...p } : h)) });

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(local).length) return;
    let saved: DepositDetail | undefined;
    const ok = await a.run(async () => {
      saved = await api.deposits.open(member!.id, clean);
    });
    if (ok && saved) router.replace(`/staff/deposit/${saved.deposit.id}`);
  };

  const count = Object.keys(errors).length;

  return (
    <Screen header={<Header title="Open a fixed deposit" onBack={() => router.back()} />} footer={<Button text="Save request" size="lg" fullWidth disabled={!member || a.busy || a.unconfirmed} loading={a.busy} onPress={() => void save()} />}>
      <Text role="body" tone="secondary">
        Enter the signed form F4. After saving, record the payment. The Secretary and President then accept it.
      </Text>
      <MemberPicker label="Depositor" value={member} onPick={setMember} error={errors.memberId} />

      {member ? (
        <>
          <Section title="Deposit">
            <View style={{ gap: space[8] }}>
              <MoneyField label="5 · Amount of deposit" required value={v.principal} onChange={(principal) => set({ principal })} error={errors.principal} hint={v.principal > 0 ? amountInWords(v.principal) : s ? `At least ${formatINR(s.fdMinAmount)}` : undefined} />
              <TextField label="6 · Period" required keyboardType="number-pad" suffix={<Text role="caption" tone="tertiary">months</Text>} value={Number.isFinite(v.tenureMonths) ? String(v.tenureMonths) : ''} onChangeText={(t) => set({ tenureMonths: t === '' ? Number.NaN : Number(t.replace(/\D/g, '')) })} error={errors.tenureMonths} hint={s ? s.fdSlabs.map((x) => `${x.fromMonths}–${x.toMonths}: ${x.ratePercent}%`).join(' · ') : undefined} />
              <Card>
                <KeyValue label="7 · Rate (from the slab)" value={rate ? `${rate}% a year` : 'No slab for this period'} />
                {mat ? (
                  <>
                    <KeyValue label="Matures on" value={formatDisplayDate(mat.maturityDate)} />
                    <KeyValue label="Maturity value" value={formatINR(mat.maturityValue)} emphasis />
                    {mat.periodicInterest > 0 ? <KeyValue label="Interest each period" value={formatINR(mat.periodicInterest)} /> : null}
                  </>
                ) : null}
              </Card>
              <Filter label="8 · Interest payable" value={v.payoutFrequency} options={[...PAYOUTS]} onChange={(payoutFrequency) => set({ payoutFrequency })} />
            </View>
          </Section>

          <Section title="Holders">
            <View style={{ gap: space[8] }}>
              <Segmented
                label="Holding"
                value={v.holding}
                options={[{ value: 'SINGLE', label: 'Member' }, { value: 'JOINT', label: 'Joint' }, { value: 'MINOR', label: 'Minor' }]}
                onChange={(x) => {
                  const holding = x as FdRequestInput['holding'];
                  set({ holding, ...(holding === 'JOINT' && !holders.length ? { holders: [{ ...blankHolder }] } : {}), ...(holding === 'MINOR' && !v.minor ? { minor: { name: '', dob: '', guardianRelation: 'Father' } } : {}) });
                }}
              />
              {v.holding === 'JOINT' ? (
                <View style={{ gap: space[4] }}>
                  {holders.map((h, i) => (
                    <Card key={i}>
                      <View style={{ gap: space[6] }}>
                        <TextField label="Name" value={h.name} onChangeText={(name) => setHolder(i, { name })} error={errors[`holders.${i}.name`]} />
                        <TextField label="Father's / husband's name" value={h.fatherOrHusbandName} onChangeText={(fatherOrHusbandName) => setHolder(i, { fatherOrHusbandName })} error={errors[`holders.${i}.fatherOrHusbandName`]} />
                        <TextField label="Occupation" value={h.occupation} onChangeText={(occupation) => setHolder(i, { occupation })} />
                        <TextField label="Phone" keyboardType="phone-pad" value={h.phone} onChangeText={(phone) => setHolder(i, { phone: phone.replace(/\D/g, '').slice(0, 10) })} error={errors[`holders.${i}.phone`]} />
                        <TextField label="Address" value={h.address} onChangeText={(address) => setHolder(i, { address })} error={errors[`holders.${i}.address`]} />
                        {holders.length > 1 ? <Button text="Remove" subType="inline" buttonType="danger" leftSlot={Trash2} style={{ alignSelf: 'flex-start' }} onPress={() => set({ holders: holders.filter((_, j) => j !== i) })} /> : null}
                      </View>
                    </Card>
                  ))}
                  {holders.length < 2 ? <Button text="Add another holder" buttonType="secondary" fullWidth onPress={() => set({ holders: [...holders, { ...blankHolder }] })} /> : null}
                  <Text role="caption" tone="tertiary">
                    {holders.length + 1} holders: payment to {holders.length === 1 ? 'either or the survivor' : 'any one or the survivors'} (rules 3–4).
                  </Text>
                  {errors.holders ? (
                    <Text role="caption" tone="danger">
                      {errors.holders}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {v.holding === 'MINOR' && v.minor ? (
                <Card>
                  <View style={{ gap: space[6] }}>
                    <TextField label="Minor's name" value={v.minor.name} onChangeText={(name) => set({ minor: { ...v.minor!, name } })} error={errors['minor.name']} />
                    <DateField label="Date of birth" value={v.minor.dob} onChange={(dob) => set({ minor: { ...v.minor!, dob: dob ?? '' } })} error={errors['minor.dob']} />
                    <TextField label="Member is the minor's" value={v.minor.guardianRelation} onChangeText={(guardianRelation) => set({ minor: { ...v.minor!, guardianRelation } })} placeholder="Father / Mother" error={errors['minor.guardianRelation']} />
                  </View>
                </Card>
              ) : null}
            </View>
          </Section>

          <Section title="9 · Nominee">
            <View style={{ gap: space[8] }}>
              <TextField label="Nominee name" value={v.nominee.name} onChangeText={(name) => set({ nominee: { ...v.nominee, name } })} error={errors['nominee.name']} />
              <TextField label="Relationship" value={v.nominee.relation} onChangeText={(relation) => set({ nominee: { ...v.nominee, relation: relation as FdRequestInput['nominee']['relation'] } })} error={errors['nominee.relation']} />
            </View>
          </Section>

          {count ? <Alert type="warning" heading="Some details need attention" description={Object.values(errors).join(' · ')} /> : null}
          <ActionAlert action={a} heading="Not saved" check={{ text: 'Check Deposits', href: '/staff/deposits' }} />
          <Text role="caption" tone="tertiary">
            The member signed the paper F4, so no OTP is needed. The FDR is issued when the President accepts.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
