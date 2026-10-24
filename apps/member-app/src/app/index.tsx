import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { c } from '@/theme';

/** Entry gate: applicants see their tracker, members their home, everyone else the Welcome screen. */
export default function Index() {
  const { ready, session } = useAuth();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.background,
        }}
      >
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;
  return <Redirect href={session.user.role === 'APPLICANT' ? '/tracker' : '/home'} />;
}
