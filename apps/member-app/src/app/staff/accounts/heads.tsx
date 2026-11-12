// ST-48m Chart of accounts (G2, D-112). Main heads are fixed (the modules post to them); the
// Accountant adds sub-heads under income and expense heads, and can close or reopen them.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { LedgerHead } from '@tgs/types';
import { ActionAlert, Expand, Loaded, useAction, useCan } from '@/components/staff';
import { api } from '@/lib/api';
import { Button, Header, Screen, Text, TextField } from '@/ui';
import { space } from '@/theme';

const TYPE_LABEL: Record<LedgerHead['type'], string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Capital and reserves', INCOME: 'Income', EXPENSE: 'Expenses' };

export default function Heads() {
  const can = useCan();
  const q = useQuery({ queryKey: ['ledger-heads'], queryFn: api.accounts.heads });
  const a = useAction();
  const [parent, setParent] = useState<string>();
  const [name, setName] = useState('');
  const editable = can('ledger.post');
  return (
    <Screen header={<Header title="Chart of accounts" onBack={() => router.back()} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Loaded q={q} what="the chart of accounts">
        {(all) => (
          <>
            {(Object.keys(TYPE_LABEL) as Array<LedgerHead['type']>).map((t) => (
              <Expand key={t} title={TYPE_LABEL[t]} initiallyOpen={t === 'EXPENSE'}>
                {all
                  .filter((h) => h.type === t && !h.parentCode)
                  .map((h) => (
                    <View key={h.code} style={{ gap: space[2], paddingVertical: space[2] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                        <Text role="body" style={{ flex: 1 }}>
                          <Text role="body" tone="tertiary">
                            {h.code}{' '}
                          </Text>
                          {h.name}
                        </Text>
                        {editable && (t === 'INCOME' || t === 'EXPENSE') ? <Button text="Add" buttonType="secondary" size="sm" onPress={() => (setParent(parent === h.code ? undefined : h.code), setName(''))} /> : null}
                      </View>
                      {all
                        .filter((c) => c.parentCode === h.code)
                        .map((c) => (
                          <View key={c.code} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: space[6] }}>
                            <Text role="caption" tone={c.active ? 'secondary' : 'tertiary'} style={{ flex: 1, textDecorationLine: c.active ? 'none' : 'line-through' }}>
                              {c.code} {c.name}
                            </Text>
                            {editable ? <Button text={c.active ? 'Close' : 'Reopen'} buttonType="secondary" size="sm" loading={a.busy} onPress={() => void a.run(() => api.accounts.updateHead(c.code, { active: !c.active }))} /> : null}
                          </View>
                        ))}
                      {parent === h.code ? (
                        <View style={{ gap: space[3], paddingLeft: space[6] }}>
                          <TextField label={`New sub-head under ${h.name}`} value={name} onChangeText={setName} placeholder="e.g. Electricity" error={a.fields.name} />
                          <Button text="Add sub-head" fullWidth loading={a.busy} disabled={name.trim().length < 3} onPress={() => void a.run(() => api.accounts.addHead({ parentCode: h.code, name: name.trim() }), () => (setParent(undefined), setName('')))} />
                        </View>
                      ) : null}
                    </View>
                  ))}
              </Expand>
            ))}
            <ActionAlert action={a} />
          </>
        )}
      </Loaded>
    </Screen>
  );
}
