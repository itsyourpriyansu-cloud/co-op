// D-132: the bank account a loan is paid into. Used by the member's wizard (MB-05) and the staff form.
// Rules live in @tgs/domain validateLoanRequest; errors arrive keyed `bankAccount.<field>`.
import { View } from 'react-native';
import type { LoanBankAccount } from '@tgs/types';
import { Text, TextField } from '@/ui';
import { space } from '@/theme';

export const EMPTY_BANK: LoanBankAccount = { holderName: '', bankName: '', branch: '', accountNo: '', ifsc: '' };

export function BankAccountFields({ value, onChange, err, intro }: { value: LoanBankAccount | undefined; onChange: (v: LoanBankAccount) => void; err: (key: string) => string | undefined; intro: string }) {
  const v = value ?? EMPTY_BANK;
  const set = (p: Partial<LoanBankAccount>) => onChange({ ...v, ...p });
  const e = (k: keyof LoanBankAccount) => err(`bankAccount.${k}`);
  return (
    <View style={{ gap: space[8] }}>
      <Text role="caption" tone="secondary">
        {intro}
      </Text>
      <TextField label="Account holder's name" value={v.holderName} onChangeText={(holderName) => set({ holderName })} autoCapitalize="words" required {...(e('holderName') ? { error: e('holderName')! } : {})} />
      <TextField label="Bank name" value={v.bankName} onChangeText={(bankName) => set({ bankName })} placeholder="e.g. State Bank of India" required {...(e('bankName') ? { error: e('bankName')! } : {})} />
      <TextField label="Branch (optional)" value={v.branch ?? ''} onChangeText={(branch) => set({ branch })} />
      <TextField label="Account number" value={v.accountNo} onChangeText={(t) => set({ accountNo: t.replace(/\D/g, '').slice(0, 18) })} keyboardType="number-pad" required {...(e('accountNo') ? { error: e('accountNo')! } : {})} />
      <TextField label="IFSC" value={v.ifsc} onChangeText={(t) => set({ ifsc: t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) })} autoCapitalize="characters" autoCorrect={false} hint="On your cheque book or passbook" required {...(e('ifsc') ? { error: e('ifsc')! } : {})} />
    </View>
  );
}
