// Payment screens (MB-18, receipt view) are for members only; a lost session goes back to the start.
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { color } from '@/theme';

export default function PaymentLayout() {
  const { ready, session } = useAuth();
  if (ready && session?.user.role !== 'MEMBER') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas }, animation: 'slide_from_right' }} />;
}
