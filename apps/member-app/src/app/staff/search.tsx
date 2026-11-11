// Global search (docs/04 §3, D-064): members, loans, deposits, joining applications, receipts. Scoped by the server.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react-native';
import type { SearchHit } from '@tgs/types';
import { Loaded, Row, staffHref, useDebounced } from '@/components/staff';
import { api } from '@/lib/api';
import { Card, EmptyState, Header, Screen, Section, Text, TextField } from '@/ui';
import { space } from '@/theme';

const KIND: Record<SearchHit['kind'], string> = { member: 'Members', loan: 'Loans', deposit: 'Deposits', application: 'Joining', receipt: 'Receipts' };

export default function Search() {
  const [text, setText] = useState('');
  const dq = useDebounced(text.trim());
  const q = useQuery({ queryKey: ['global-search', dq], queryFn: () => api.search(dq), enabled: dq.length >= 2 });
  return (
    <Screen header={<Header title="Search" onBack={() => router.back()} />}>
      <TextField compact label="Search" value={text} onChangeText={setText} placeholder="Members, loans, FDs, receipts" autoFocus autoCorrect={false} />
      {dq.length < 2 ? (
        <Text role="caption" tone="tertiary">
          Type at least two letters of a name, General No., Employee ID, loan or FDR number.
        </Text>
      ) : (
        <Loaded q={q} what="search results" height={68}>
          {(hits) =>
            hits.length ? (
              <View style={{ gap: space[8] }}>
                {(Object.keys(KIND) as SearchHit['kind'][])
                  .filter((k) => hits.some((h) => h.kind === k))
                  .map((k) => (
                    <Section key={k} title={KIND[k]}>
                      <Card padded={false}>
                        {hits
                          .filter((h) => h.kind === k)
                          .map((h, i) => (
                            <Row key={h.id} label={h.title} hint={h.subtitle} divider={i > 0} onPress={() => router.push(staffHref(h.link))} />
                          ))}
                      </Card>
                    </Section>
                  ))}
              </View>
            ) : (
              <EmptyState icon={SearchX} title={`No matches for “${dq}”`} description="Try a General No., Employee ID, loan or FDR number." />
            )
          }
        </Loaded>
      )}
    </Screen>
  );
}
