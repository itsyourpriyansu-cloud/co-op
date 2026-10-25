// MB-02 Profile & agreements (read-only). Details grouped like the paper form, left-over service,
// service history, my agreements (salary recovery mandate), documents, and the status of any
// change requests. Edit / request a change → MB-19.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BadgeCheck, ChevronDown, ChevronUp, FileText, PenLine, ShieldAlert } from 'lucide-react-native';
import { formatCycle, formatDisplayDate, formatINR, PROFILE_FIELDS } from '@tgs/domain';
import type { ProfileChangeRequest, ProfileFieldChange } from '@tgs/types';
import { useMyProfile } from '@/lib/profile';
import { Alert, Button, Card, Divider, Header, KeyValue, Screen, Section, Skeleton, StatusTag, Text } from '@/ui';
import { color, radius, space } from '@/theme';

const show = (c: Pick<ProfileFieldChange, 'field'>, v: string) => (PROFILE_FIELDS[c.field].kind === 'money' && v ? formatINR(Number(v) * 100) : v || '—');
const address = (a: { line1: string; city: string; district: string; pincode: string }) => [a.line1, a.city, a.district, a.pincode].filter(Boolean).join(', ');

function RequestCard({ r }: { r: ProfileChangeRequest }) {
  const step =
    r.status === 'PENDING'
      ? r.route === 'DDO_THEN_OFFICE' && !r.ddoCertified
        ? 'With your department (DDO) to confirm'
        : 'With the society office'
      : r.status === 'APPROVED'
        ? `Approved ${r.decidedAt ? formatDisplayDate(r.decidedAt.slice(0, 10)) : ''}`
        : 'Not approved';
  return (
    <Card>
      <View style={{ gap: space[4] }}>
        <View style={styles.rowBetween}>
          <Text role="label" style={{ flex: 1 }}>
            {r.fields.map((f) => PROFILE_FIELDS[f.field].label).join(', ')}
          </Text>
          <StatusTag entity="changeRequest" status={r.status} size="xs" />
        </View>
        {r.fields.map((f) => (
          <Text key={f.field} role="caption" tone="secondary">
            {show(f, f.oldValue)} → {show(f, f.newValue)}
          </Text>
        ))}
        <Text role="caption" tone={r.status === 'REJECTED' ? 'danger' : 'tertiary'}>
          {step}
          {r.status === 'REJECTED' && r.remarks ? `: ${r.remarks}` : ''}
        </Text>
      </View>
    </Card>
  );
}

export default function Profile() {
  const profile = useMyProfile();
  const [allHistory, setAllHistory] = useState(false);
  const p = profile.data;
  const m = p?.member;

  return (
    <Screen header={<Header title="Profile & agreements" onBack={() => router.back()} />} refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      {profile.isLoading ? (
        <View style={{ gap: space[8] }}>
          <Skeleton height={120} radius={radius.card} />
          <Skeleton height={260} radius={radius.card} />
        </View>
      ) : profile.isError || !p || !m ? (
        <Alert type="error" heading="Couldn't load your profile" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void profile.refetch() }} />
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.initials}>
              <Text role="sectionTitle" tone="onBrand">
                {m.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </Text>
            </View>
            <View style={{ flex: 1, gap: space[1] }}>
              <Text role="sectionTitle" tone="onBrand">
                {m.name}
              </Text>
              <Text role="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                General No. {m.generalNo} · {m.designation}
              </Text>
              <Text role="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {p.departmentName}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Button text="Edit contact" buttonType="secondary" leftSlot={PenLine} style={{ flex: 1 }} onPress={() => router.push('/profile/edit')} />
            <Button text="Request a change" style={{ flex: 1 }} onPress={() => router.push('/profile/request')} />
          </View>

          {p.changeRequests.length ? (
            <Section title="My requests" description="Changes you asked the society to make.">
              {p.changeRequests.slice(0, 3).map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </Section>
          ) : null}

          <Section title="Service">
            <Card>
              <KeyValue label="Left-over service" value={p.leftover.label} emphasis />
              <KeyValue label="Date of joining" value={formatDisplayDate(m.doj)} />
              <KeyValue label="Date of retirement" value={formatDisplayDate(m.dor)} />
              <KeyValue label="Employee ID" value={m.employeeId} />
              <KeyValue label="Employment" value={m.employmentType === 'REGULAR' ? 'Regular' : 'Approved probationer'} />
            </Card>
          </Section>

          <Section title="Personal">
            <Card>
              <KeyValue label="Father's name" value={m.fatherName} />
              <KeyValue label="Date of birth" value={formatDisplayDate(m.dob)} />
              <KeyValue label="Mobile" value={m.mobileMasked} />
              <KeyValue label="Email" value={m.email ?? '—'} />
              <KeyValue label="Present address" value={address(m.presentAddress)} />
              <KeyValue label="Nominee" value={`${m.nominee.name} (${m.nominee.relation})`} />
            </Card>
          </Section>

          <Section title="Shares & pay">
            <Card>
              <KeyValue label="Shares" value={`${p.shares?.numberOfShares ?? m.numberOfShares} · ${formatINR(p.shares?.shareCapital ?? 0)}`} />
              <KeyValue label="Share deposit" value={formatINR(p.shares?.shareDepositBalance ?? 0)} />
              <KeyValue label="Gross salary" value={formatINR(m.payProfile.grossSalary)} />
              <KeyValue label="Scale of pay" value={m.payProfile.scaleOfPay || '—'} />
              <Text role="caption" tone="tertiary">
                {m.payProfile.certifiedAt ? `Last certified by your DDO on ${formatDisplayDate(m.payProfile.certifiedAt)}.` : 'Not certified yet.'}
              </Text>
            </Card>
          </Section>

          <Section title="My agreements">
            <Card>
              <View style={styles.rowIcon}>
                {p.mandate?.status === 'AGREED' ? <BadgeCheck size={22} color={color.status.success.fg} /> : <ShieldAlert size={22} color={color.status.warning.fg} />}
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="label">Salary recovery agreement</Text>
                  <Text role="caption" tone="secondary">
                    {p.mandate ? `Signed ${formatDisplayDate(p.mandate.signedOn)}${p.mandate.status === 'AGREED' ? ` · agreed by ${p.mandate.agreedByName ?? 'your DDO'}${p.mandate.agreedOn ? ` on ${formatDisplayDate(p.mandate.agreedOn)}` : ''}` : ' · waiting for your new DDO to agree'}` : 'Not on record'}
                  </Text>
                </View>
              </View>
              <Divider />
              <View style={[styles.rowIcon, { paddingTop: space[4] }]}>
                <BadgeCheck size={22} color={color.status.success.fg} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text role="label">Bye-laws and declarations</Text>
                  <Text role="caption" tone="secondary">
                    Accepted when you joined on {formatDisplayDate(m.joinedSocietyOn)}
                  </Text>
                </View>
              </View>
            </Card>
          </Section>

          <Section title="Service history">
            <Card>
              <View style={{ gap: space[6] }}>
                {(allHistory ? p.serviceEvents : p.serviceEvents.slice(0, 3)).map((e) => (
                  <View key={e.id} style={{ gap: space[1] }}>
                    <Text role="label">{e.summary}</Text>
                    <Text role="caption" tone="tertiary">
                      {formatDisplayDate(e.date)}
                      {e.effectiveCycle ? ` · demand from ${formatCycle(e.effectiveCycle)}` : ''}
                    </Text>
                  </View>
                ))}
                {p.serviceEvents.length > 3 ? <Button text={allHistory ? 'Show less' : `Show all ${p.serviceEvents.length}`} buttonType="secondary" size="sm" subType="inline" rightSlot={allHistory ? ChevronUp : ChevronDown} onPress={() => setAllHistory((v) => !v)} /> : null}
              </View>
            </Card>
          </Section>

          <Section title="Documents" description="Kept by the society office.">
            <Card padded={false}>
              {p.documents.map((d, i) => (
                <View key={d.type} style={[styles.docRow, i > 0 && styles.divider]}>
                  <FileText size={20} color={color.brand.solid} />
                  <View style={{ flex: 1 }}>
                    <Text role="label">{d.label}</Text>
                    <Text role="caption" tone="tertiary">
                      {d.fileName}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: space[6], backgroundColor: color.brand.solid, borderRadius: radius.card, padding: space[8] },
  initials: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: space[4] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  rowIcon: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6], paddingBottom: space[4] },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], paddingHorizontal: space[8], paddingVertical: space[6] },
  divider: { borderTopWidth: 1, borderTopColor: color.border.subtle },
});
