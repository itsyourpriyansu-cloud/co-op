// ST-02m Work Queue: everything waiting on the signed-in user, oldest first. DDOs see their department.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react-native';
import { formatDisplayDate, formatINR } from '@tgs/domain';
import type { AnyStatus, WorkItem } from '@tgs/types';
import { api } from '@/lib/api';
import { Filter, Loaded, RecordCard, Stack2, staffHref, WaitTag } from '@/components/staff';
import { EmptyState, Screen, StatusTag, Tag, Text } from '@/ui';
import { space } from '@/theme';

function stageTag(i: WorkItem) {
  if (i.status && (i.kind === 'loan' || i.kind === 'membership')) return <StatusTag entity={i.kind} status={i.status as AnyStatus} audience="staff" size="xs" />;
  return <Tag text={i.stageLabel} size="xs" />;
}

export default function Queue() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const q = useQuery({ queryKey: ['work-queue'], queryFn: api.workQueue, refetchInterval: 20_000 });
  const [tab, setTab] = useState(params.tab ?? 'ALL');
  useEffect(() => {
    if (params.tab) setTab(params.tab);
  }, [params.tab]);
  const data = q.data;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: space[1] }}>
        <Text role="pageTitle">Work Queue</Text>
        <Text role="caption" tone="secondary">
          {data ? `${data.items.length} waiting, oldest first${data.scope.departmentName ? ` · ${data.scope.departmentName} only` : ''}` : 'Waiting for your review, certificate, signature or payout'}
        </Text>
      </View>
      {data && data.tabs.length > 0 ? <Filter value={tab} options={[{ value: 'ALL', label: `All ${data.items.length}` }, ...data.tabs.map((t) => ({ value: t.key, label: `${t.label} ${t.count}` }))]} onChange={setTab} /> : null}
      <Loaded q={q} what="your queue">
        {(d) => {
          const rows = d.items.filter((i) => tab === 'ALL' || i.stage === tab);
          return rows.length ? (
            <Stack2>
              {rows.map((i) => (
                <RecordCard key={`${i.kind}-${i.id}`} title={i.title} subtitle={`${i.ref} · ${i.subtitle}`} {...(i.amount ? { amount: formatINR(i.amount) } : {})} tag={stageTag(i)} onPress={() => router.push(staffHref(i.link))}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
                    <WaitTag days={i.days} />
                    {i.overTarget ? <Tag text={`Over the ${i.targetLabel ?? 'target'}`} color="error" size="xs" /> : null}
                    <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
                      {i.departmentName ? `${i.departmentName} · ` : ''}since {formatDisplayDate(i.since)}
                    </Text>
                    <Text role="captionStrong" tone="link">
                      {i.actionLabel}
                    </Text>
                  </View>
                </RecordCard>
              ))}
            </Stack2>
          ) : (
            <EmptyState icon={Inbox} title="Nothing waiting on you" description="New applications, certificates and signatures appear here as soon as they reach your stage." />
          );
        }}
      </Loaded>
    </Screen>
  );
}
