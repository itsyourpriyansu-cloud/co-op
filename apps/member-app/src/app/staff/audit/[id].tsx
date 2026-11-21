// ST-69m one audit entry: who, when, from where, and the record before and after.
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDateTime } from '@tgs/domain';
import { Loaded } from '@/components/staff';
import { api } from '@/lib/api';
import { Card, Header, MetadataListItem, Screen, Section, Text } from '@/ui';
import { color, radius, spacing } from '@/theme';

function Snapshot({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <Section title={title}>
      <ScrollView horizontal style={{ borderWidth: 1, borderColor: color.border, borderRadius: radius.element, backgroundColor: color.background.muted }} contentContainerStyle={{ padding: spacing[3] }}>
        <Text type="supporting" style={{ fontFamily: 'monospace' }}>
          {JSON.stringify(value, null, 2)}
        </Text>
      </ScrollView>
    </Section>
  );
}

export default function AuditEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['audit-entry', id], queryFn: () => api.audit.get(id) });
  return (
    <Loaded page q={q} what="this entry">
      {(e) => (
        <Screen header={<Header title="Audit entry" onBack={() => router.back()} />}>
          <View style={{ gap: spacing[1] }}>
            <Text type="h1">{e.summary}</Text>
            <Text type="supporting" tone="secondary">
              {e.actorName ?? 'System'} · {formatDisplayDateTime(e.at)}
            </Text>
          </View>
          <Card>
            <MetadataListItem label="Action" value={e.action} />
            <MetadataListItem label="Record" value={`${e.entity}${e.entityId ? ` ${e.entityId}` : ''}`} />
            <MetadataListItem label="Role" value={e.actorRole ?? '—'} />
            <MetadataListItem label="From" value={e.ip ?? '—'} />
          </Card>
          <Snapshot title="Before" value={e.before} />
          <Snapshot title="After" value={e.after} />
        </Screen>
      )}
    </Loaded>
  );
}
