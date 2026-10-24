import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';

/** Applicant mode: no bottom bar, only the application and its tracker (docs/12 §2.2). */
export default function ApplicantLayout() {
  const { ready, session } = useAuth();
  if (ready && session?.user.role !== 'APPLICANT') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
