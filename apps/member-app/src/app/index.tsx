import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { color } from '@/theme';

/** Entry gate: applicants → their tracker (it routes to eligibility/form as needed); members → home. */
export default function Index() {
  const { ready, session } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.canvas }}>
        <ActivityIndicator color={color.brand.solid} size="large" />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;
  return <Redirect href={session.user.role === 'APPLICANT' ? '/tracker' : '/home'} />;
}
