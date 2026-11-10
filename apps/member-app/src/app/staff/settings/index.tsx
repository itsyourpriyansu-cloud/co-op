// ST-60m … ST-68m Settings: the console's section list, one row per section.
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Row } from '@/components/staff';
import { api } from '@/lib/api';
import { SECTIONS } from '@/lib/staffSettings';
import { Alert, Card, Header, Screen, Text } from '@/ui';

export default function Settings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  return (
    <Screen header={<Header title="Settings" onBack={() => router.back()} />}>
      <Text role="body" tone="secondary">
        Rates, limits, masters and messages. Every change is validated and recorded with your name.
      </Text>
      {q.data && !q.data.canEdit ? <Alert type="neutral" heading="View only" description="Only the Super Admin can change settings." /> : null}
      <Card padded={false}>
        {SECTIONS.map((s, i) => (
          <Row key={s.id} icon={s.icon} label={s.label} hint={s.hint} divider={i > 0} onPress={() => router.push(`/staff/settings/${s.id}`)} />
        ))}
      </Card>
    </Screen>
  );
}
