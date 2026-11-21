// MJ-05 Applicant home: draft progress → live stage tracker → welcome (General No.) (D-026, docs/10 §2).
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Banknote, Bell, CircleX, FlaskConical, LogOut, PartyPopper, PenLine } from 'lucide-react-native';
import { formatDisplayDate, formatINR, validateMembershipForm } from '@tgs/domain';
import { useNotifications } from '@/lib/account';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { stagesFor, STEPS, errorsForStep, useJoiningReference, useMyApplication } from '@/lib/joining';
import { Banner, Button, Card, EmptyState, heroSurface, Skeleton, StageTracker, StatusToken, Text, Stepper, Link } from '@/ui';
import { color, radius, spacing, layout } from '@/theme';

export default function Tracker() {
  const { session, logout, syncSession } = useAuth();
  const { submitted } = useLocalSearchParams<{ submitted?: string }>();
  const mine = useMyApplication();
  const unread = useNotifications().data?.unread ?? 0;
  const reference = useJoiningReference();
  const [demoBusy, setDemoBusy] = useState(false);
  const app = mine.data;

  // No application yet → eligibility first.
  useEffect(() => {
    if (mine.isSuccess && app === null) router.replace('/eligibility');
  }, [mine.isSuccess, app]);

  const signOut = async () => {
    await logout();
    router.replace('/welcome');
  };

  const demo = async (fn: (id: string) => Promise<unknown>) => {
    if (!app) return;
    setDemoBusy(true);
    try {
      await fn(app.id);
    } catch {
      // Stale stage (e.g. a double tap): the refetch below shows the real state.
    } finally {
      await mine.refetch();
      setDemoBusy(false);
    }
  };

  const enterAsMember = async () => {
    await syncSession();
    router.replace('/home');
  };

  const body = () => {
    if (mine.isLoading || !app) {
      return (
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={140} radius={radius.container} />
          <Skeleton height={260} radius={radius.container} />
        </View>
      );
    }

    // Draft: show how far along the form is and send them back into it.
    if (app.status === 'DRAFT') {
      const required = (reference.data?.requiredDocuments ?? []).filter((d) => d.required);
      const errors = validateMembershipForm(app.form, required);
      const done = STEPS.slice(0, -1).filter((_, i) => Object.keys(errorsForStep(errors, i)).length === 0).length;
      return (
        <>
          <View style={{ gap: spacing[1.5] }}>
            <Text type="h1">Hi {app.form?.personal?.fullName?.split(' ')[0] ?? session?.user.name.split(' ')[0]}</Text>
            <Text type="body" tone="secondary">
              Your application is saved. Pick up where you left off.
            </Text>
          </View>
          <Card>
            <View style={{ gap: spacing[4] }}>
              <View style={styles.rowBetween}>
                <Text type="h4">Membership application</Text>
                <StatusToken entity="membership" status="DRAFT" />
              </View>
              <Stepper step={done} total={STEPS.length - 1} title="Sections complete" />
              <Text type="supporting" tone="secondary">
                {done} of {STEPS.length - 1} sections complete · about {Math.max(1, (STEPS.length - 1 - done) * 1.5)} minutes left
              </Text>
              <Button label="Continue application" iconEnd={ArrowRight} size="lg" fullWidth onPress={() => router.push('/apply')} />
            </View>
          </Card>
        </>
      );
    }

    const stages = stagesFor(app);
    const shares = app.sharesProposed || app.form?.shares?.sharesProposed || 0;
    return (
      <>
        {submitted ? <Banner status="success" heading="Application submitted" description="Signed with OTP. We'll notify you as each stage completes." /> : null}

        {app.status === 'ACTIVE' ? (
          <Card style={styles.welcome}>
            <View style={{ alignItems: 'center', gap: spacing[3] }}>
              <View style={styles.party}>
                <PartyPopper size={34} color={color.text.onAccent} strokeWidth={1.5} />
              </View>
              <Text type="h3" tone="onAccent" style={{ textAlign: 'center' }}>
                Welcome to the society!
              </Text>
              <View style={{ alignItems: 'center' }}>
                <Text type="supporting" style={{ color: color.text.onAccentMuted }}>
                  Your General No.
                </Text>
                <Text type="display-2" tone="onAccent">
                  {app.allottedGeneralNo}
                </Text>
              </View>
              <Button label="Go to my account" variant="secondary" size="lg" fullWidth iconEnd={ArrowRight} onPress={() => void enterAsMember()} />
            </View>
          </Card>
        ) : (
          <View style={{ gap: spacing[1.5] }}>
            <Text type="h1">Your application</Text>
            <View style={{ alignSelf: 'flex-start' }}>
              <StatusToken entity="membership" status={app.status} size="md" />
            </View>
            <Text type="supporting" tone="secondary">
              {app.applicationNo}
              {app.submittedOn ? ` · submitted ${formatDisplayDate(app.submittedOn)}` : ''}
            </Text>
          </View>
        )}

        {app.status === 'INFO_REQUESTED' && app.infoRequest ? (
          <Banner
            status="warning"
            heading={`${app.infoRequest.by === 'DDO' ? 'Your department' : 'The society office'} needs a correction`}
            description={app.infoRequest.message}
            action={{ text: 'Fix and resubmit', onPress: () => router.push('/apply') }}
          />
        ) : null}

        {app.status === 'SHARE_PAYMENT_PENDING' ? (
          <Card>
            <View style={{ gap: spacing[3] }}>
              <View style={styles.rowIcon}>
                <Banknote size={22} color={color.accent} />
                <Text type="h4" style={{ flex: 1 }}>
                  Pay {formatINR(shares * (reference.data?.shareValue ?? 10000))} for {shares} shares
                </Text>
              </View>
              <Text type="body" tone="secondary">
                Pay at the society office (cash or bank transfer). Your membership becomes active as soon as the cashier records it.
              </Text>
              <Text type="supporting" tone="secondary">
                {reference.data?.society.address}
              </Text>
            </View>
          </Card>
        ) : null}

        {app.status === 'REJECTED' ? (
          <EmptyState icon={CircleX} tone="error" title="Application not approved" description={app.events.at(-1)?.remarks ?? 'Contact the society office for details.'} />
        ) : null}

        <Card>
          <StageTracker stages={stages} />
        </Card>

        {/* Prototype only: move the application through staff stages until the console screens exist (M3). */}
        {app.status !== 'ACTIVE' && app.status !== 'REJECTED' ? (
          <Card style={styles.demo}>
            <View style={{ gap: spacing[3] }}>
              <View style={styles.rowIcon}>
                <FlaskConical size={18} color={color.status.warning.text} />
                <Text type="label" tone="warning">
                  Demo controls
                </Text>
              </View>
              <Text type="supporting" tone="secondary">
                Staff act in the Admin Console and this page updates by itself. These buttons act for them when you demo alone.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                {app.status !== 'INFO_REQUESTED' ? <Button label="Advance stage" size="sm" loading={demoBusy} onPress={() => void demo(api.demo.membership.advance)} /> : null}
                {['SUBMITTED', 'DDO_CERTIFICATION', 'OFFICE_REVIEW'].includes(app.status) ? <Button label="Request correction" variant="secondary" size="sm" disabled={demoBusy} onPress={() => void demo(api.demo.membership.requestInfo)} /> : null}
                <Button label="Reject" variant="secondary" size="sm" disabled={demoBusy} onPress={() => void demo(api.demo.membership.reject)} />
              </View>
            </View>
          </Card>
        ) : null}

        {app.signature ? (
          <View style={styles.rowIcon}>
            <PenLine size={16} color={color.text.secondary} />
            <Text type="supporting" tone="secondary" style={{ flex: 1 }}>
              Signed with OTP on {formatDisplayDate(app.signature.signedAt.slice(0, 10))} · agreement version {app.signature.textVersion}
            </Text>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.background.body }} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()} tintColor={color.accent} />}
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications' as Href)} style={styles.bell} hitSlop={8}>
            <Bell size={22} color={color.text.primary} strokeWidth={1.75} />
            {unread ? (
              <View style={styles.badge}>
                <Text type="supporting" weight="medium" tone="onAccent" style={{ fontSize: 10, lineHeight: 14 }}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {body()}
        <Link label="Sign out" icon={LogOut} onPress={() => void signOut()} style={{ alignSelf: 'center', marginTop: spacing[4] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: 'flex-end' },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.background.surface, borderWidth: 1, borderColor: color.border },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: color.status.error.solid, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing[4], gap: spacing[5], paddingBottom: spacing[8], width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  welcome: { ...heroSurface, padding: spacing[6] },
  party: { width: 72, height: 72, borderRadius: 36, backgroundColor: color.accentTile, alignItems: 'center', justifyContent: 'center' },
  demo: { borderStyle: 'dashed', borderColor: color.status.warning.border, backgroundColor: color.status.warning.tint },
});
