// MJ-05 Applicant home: draft progress → live stage tracker → welcome (General No.) (D-026, docs/10 §2).
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Banknote, CircleX, FlaskConical, LogOut, PartyPopper, PenLine } from 'lucide-react-native';
import { formatDisplayDate, formatINR, validateMembershipForm } from '@tgs/domain';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { stagesFor, STEPS, errorsForStep, useJoiningReference, useMyApplication } from '@/lib/joining';
import { Alert, Button, Card, EmptyState, Skeleton, StageTracker, StatusTag, Text, WizardProgress } from '@/ui';
import { color, radius, space, theme, onBrandMuted, onBrandTile } from '@/theme';

export default function Tracker() {
  const { session, logout, syncSession } = useAuth();
  const { submitted } = useLocalSearchParams<{ submitted?: string }>();
  const mine = useMyApplication();
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
        <View style={{ gap: space[8] }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={140} radius={radius.card} />
          <Skeleton height={260} radius={radius.card} />
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
          <View style={{ gap: space[3] }}>
            <Text role="pageTitle">Hi {app.form?.personal?.fullName?.split(' ')[0] ?? session?.user.name.split(' ')[0]}</Text>
            <Text role="body" tone="secondary">
              Your application is saved. Pick up where you left off.
            </Text>
          </View>
          <Card>
            <View style={{ gap: space[8] }}>
              <View style={styles.rowBetween}>
                <Text role="cardTitle">Membership application</Text>
                <StatusTag entity="membership" status="DRAFT" />
              </View>
              <WizardProgress step={done} total={STEPS.length - 1} title="Sections complete" />
              <Text role="caption" tone="secondary">
                {done} of {STEPS.length - 1} sections complete · about {Math.max(1, (STEPS.length - 1 - done) * 1.5)} minutes left
              </Text>
              <Button text="Continue application" rightSlot={ArrowRight} size="lg" fullWidth onPress={() => router.push('/apply')} />
            </View>
          </Card>
        </>
      );
    }

    const stages = stagesFor(app);
    const shares = app.sharesProposed || app.form?.shares?.sharesProposed || 0;
    return (
      <>
        {submitted ? <Alert type="success" heading="Application submitted" description="Signed with OTP. We'll notify you as each stage completes." /> : null}

        {app.status === 'ACTIVE' ? (
          <Card style={styles.welcome}>
            <View style={{ alignItems: 'center', gap: space[6] }}>
              <View style={styles.party}>
                <PartyPopper size={34} color={color.text.onBrand} strokeWidth={1.5} />
              </View>
              <Text role="sectionTitle" tone="onBrand" style={{ textAlign: 'center' }}>
                Welcome to the society!
              </Text>
              <View style={{ alignItems: 'center' }}>
                <Text role="caption" style={{ color: onBrandMuted }}>
                  Your General No.
                </Text>
                <Text role="display" tone="onBrand">
                  {app.allottedGeneralNo}
                </Text>
              </View>
              <Button text="Go to my account" buttonType="secondary" size="lg" fullWidth rightSlot={ArrowRight} onPress={() => void enterAsMember()} />
            </View>
          </Card>
        ) : (
          <View style={{ gap: space[3] }}>
            <View style={styles.rowBetween}>
              <Text role="pageTitle" style={{ flex: 1 }}>
                Your application
              </Text>
              <StatusTag entity="membership" status={app.status} size="md" />
            </View>
            <Text role="caption" tone="tertiary">
              {app.applicationNo}
              {app.submittedOn ? ` · submitted ${formatDisplayDate(app.submittedOn)}` : ''}
            </Text>
          </View>
        )}

        {app.status === 'INFO_REQUESTED' && app.infoRequest ? (
          <Alert
            type="warning"
            heading={`${app.infoRequest.by === 'DDO' ? 'Your department' : 'The society office'} needs a correction`}
            description={app.infoRequest.message}
            action={{ text: 'Fix and resubmit', onPress: () => router.push('/apply') }}
          />
        ) : null}

        {app.status === 'SHARE_PAYMENT_PENDING' ? (
          <Card>
            <View style={{ gap: space[6] }}>
              <View style={styles.rowIcon}>
                <Banknote size={22} color={color.brand.solid} />
                <Text role="cardTitle" style={{ flex: 1 }}>
                  Pay {formatINR(shares * (reference.data?.shareValue ?? 10000))} for {shares} shares
                </Text>
              </View>
              <Text role="body" tone="secondary">
                Pay at the society office (cash or bank transfer). Your membership becomes active as soon as the cashier records it.
              </Text>
              <Text role="caption" tone="tertiary">
                {reference.data?.society.address}
              </Text>
            </View>
          </Card>
        ) : null}

        {app.status === 'REJECTED' ? (
          <EmptyState icon={CircleX} tone="danger" title="Application not approved" description={app.events.at(-1)?.remarks ?? 'Contact the society office for details.'} />
        ) : null}

        <Card>
          <StageTracker stages={stages} />
        </Card>

        {/* Prototype only: move the application through staff stages until the console screens exist (M3). */}
        {app.status !== 'ACTIVE' && app.status !== 'REJECTED' ? (
          <Card style={styles.demo}>
            <View style={{ gap: space[6] }}>
              <View style={styles.rowIcon}>
                <FlaskConical size={18} color={color.status.warning.fg} />
                <Text role="label" tone="warning">
                  Demo controls
                </Text>
              </View>
              <Text role="caption" tone="secondary">
                Staff act in the Admin Console and this page updates by itself. These buttons act for them when you demo alone.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
                {app.status !== 'INFO_REQUESTED' ? <Button text="Advance stage" size="sm" loading={demoBusy} onPress={() => void demo(api.demo.membership.advance)} /> : null}
                {['SUBMITTED', 'DDO_CERTIFICATION', 'OFFICE_REVIEW'].includes(app.status) ? <Button text="Request correction" buttonType="secondary" size="sm" disabled={demoBusy} onPress={() => void demo(api.demo.membership.requestInfo)} /> : null}
                <Button text="Reject" buttonType="secondary" size="sm" disabled={demoBusy} onPress={() => void demo(api.demo.membership.reject)} />
              </View>
            </View>
          </Card>
        ) : null}

        {app.signature ? (
          <View style={styles.rowIcon}>
            <PenLine size={16} color={color.text.tertiary} />
            <Text role="caption" tone="tertiary" style={{ flex: 1 }}>
              Signed with OTP on {formatDisplayDate(app.signature.signedAt.slice(0, 10))} · agreement version {app.signature.textVersion}
            </Text>
          </View>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg.canvas }} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={mine.isRefetching} onRefresh={() => void mine.refetch()} tintColor={color.brand.solid} />}
      >
        {body()}
        <Button text="Sign out" subType="inline" leftSlot={LogOut} onPress={() => void signOut()} style={{ alignSelf: 'center', marginTop: space[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space[8], gap: space[10], paddingBottom: space[16], width: '100%', maxWidth: theme.layout.contentMaxWidth, alignSelf: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  welcome: { backgroundColor: color.brand.solid, borderColor: color.brand.solid, padding: space[12] },
  party: { width: 72, height: 72, borderRadius: 36, backgroundColor: onBrandTile, alignItems: 'center', justifyContent: 'center' },
  demo: { borderStyle: 'dashed', borderColor: color.status.warning.border, backgroundColor: color.status.warning.bg },
});
