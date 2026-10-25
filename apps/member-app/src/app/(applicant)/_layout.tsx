import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { color } from '@/theme';

/** Applicant mode: no bottom bar, only eligibility → application → tracker (docs/12 §2.2). */
export default function ApplicantLayout() {
  const { ready, session } = useAuth();
  if (ready && session?.user.role !== 'APPLICANT') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas }, animation: 'slide_from_right' }} />;
}
