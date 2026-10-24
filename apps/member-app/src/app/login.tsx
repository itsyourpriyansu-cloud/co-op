import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@tgs/api-client';
import type { Persona } from '@tgs/types';
import { AppButton, AppText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { c, radius, space } from '@/theme';

/**
 * MA-01 Login (prototype). Members/applicants pick a demo persona; real sign-in
 * (Member No. + password, MA-02 activation, MJ-02 applicant sign-up) is built in M3/M8.
 */
export default function Login() {
  const { mode } = useLocalSearchParams<{ mode?: 'member' | 'applicant' }>();
  const role = mode === 'applicant' ? 'APPLICANT' : 'MEMBER';
  const { loginAsPersona } = useAuth();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const personas = useQuery({
    queryKey: ['personas', 'app'],
    queryFn: () => api.demo.personas('app'),
    retry: false,
  });

  const signIn = async (p: Persona) => {
    setPending(p.id);
    setError(null);
    try {
      const session = await loginAsPersona(p.id);
      router.replace(session.user.role === 'APPLICANT' ? '/tracker' : '/home');
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') router.push('/offline');
      else setError(isApiError(e) ? e.message : 'Sign-in failed.');
    } finally {
      setPending(null);
    }
  };

  const list = personas.data?.filter((p) => p.role === role) ?? [];

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={styles.back}
      >
        <ArrowLeft size={22} color={c.text} />
      </Pressable>

      <View style={{ gap: space[1] }}>
        <AppText variant="title">{role === 'APPLICANT' ? 'Become a member' : 'Sign in'}</AppText>
        <AppText variant="muted">
          Demo build with fictional people. Choose who you want to be.
        </AppText>
      </View>

      {personas.isLoading && (
        <ActivityIndicator color={c.primary} style={{ marginTop: space[8] }} />
      )}

      {personas.isError && (
        <View style={{ gap: space[3] }}>
          <AppText variant="muted">Can't reach the society server.</AppText>
          <AppButton
            label="Check connection"
            variant="outline"
            onPress={() => router.push('/offline')}
          />
        </View>
      )}

      {list.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          disabled={pending !== null}
          onPress={() => signIn(p)}
          style={({ pressed }) => [
            styles.persona,
            pressed && { backgroundColor: c.primarySubtle, borderColor: c.primary },
          ]}
        >
          <View style={styles.avatar}>
            <AppText style={styles.avatarText}>
              {p.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </AppText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading">{p.name}</AppText>
            <AppText variant="muted">{p.story}</AppText>
          </View>
          {pending === p.id ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <ChevronRight size={20} color={c.textMuted} />
          )}
        </Pressable>
      ))}

      {error && (
        <AppText style={{ color: c.danger }} accessibilityRole="alert">
          {error}
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 48, height: 48, justifyContent: 'center' },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[4],
    minHeight: 72,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: c.primary, fontWeight: '700' },
});
