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
import { Banner, Button, Card, Divider, Header, MetadataListItem, Screen, Section, Skeleton, StatusToken, Text, Link } from '@/ui';
import { color, radius, spacing } from '@/theme';

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
      <View style={{ gap: spacing[2] }}>
        <View style={styles.rowBetween}>
          <Text type="label" style={{ flex: 1 }}>
            {r.fields.map((f) => PROFILE_FIELDS[f.field].label).join(', ')}
          </Text>
          <StatusToken entity="changeRequest" status={r.status} size="xs" />
        </View>
        {r.fields.map((f) => (
          <Text key={f.field} type="supporting" tone="secondary">
            {show(f, f.oldValue)} → {show(f, f.newValue)}
          </Text>
        ))}
        <Text type="supporting" tone={r.status === 'REJECTED' ? 'error' : 'secondary'}>
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
        <View style={{ gap: spacing[4] }}>
          <Skeleton height={120} radius={radius.container} />
          <Skeleton height={260} radius={radius.container} />
        </View>
      ) : profile.isError || !p || !m ? (
        <Banner status="error" heading="Couldn't load your profile" description="Check your connection and try again." action={{ text: 'Try again', onPress: () => void profile.refetch() }} />
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.initials}>
              <Text type="h3" tone="onAccent">
                {m.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </Text>
            </View>
            <View style={{ flex: 1, gap: spacing[0.5] }}>
              <Text type="h3" tone="onAccent">
                {m.name}
              </Text>
              <Text type="supporting" style={{ color: color.text.onAccentMuted }}>
                General No. {m.generalNo} · {m.designation}
              </Text>
              <Text type="supporting" style={{ color: color.text.onAccentMuted }}>
                {p.departmentName}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Button label="Edit contact" variant="secondary" icon={PenLine} style={{ flex: 1 }} onPress={() => router.push('/profile/edit')} />
            <Button label="Request a change" style={{ flex: 1 }} onPress={() => router.push('/profile/request')} />
            <Button label="My signature" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/profile/signature')} />
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
              <MetadataListItem label="Left-over service" value={p.leftover.label} emphasis />
              <MetadataListItem label="Date of joining" value={formatDisplayDate(m.doj)} />
              <MetadataListItem label="Date of retirement" value={formatDisplayDate(m.dor)} />
              <MetadataListItem label="Employee ID" value={m.employeeId} />
              <MetadataListItem label="Employment" value={m.employmentType === 'REGULAR' ? 'Regular' : 'Approved probationer'} />
            </Card>
          </Section>

          <Section title="Personal">
            <Card>
              <MetadataListItem label="Father's name" value={m.fatherName} />
              <MetadataListItem label="Date of birth" value={formatDisplayDate(m.dob)} />
              <MetadataListItem label="Caste" value={m.caste ?? 'Not recorded'} />
              <MetadataListItem label="Mobile" value={m.mobileMasked} />
              <MetadataListItem label="Email" value={m.email ?? '—'} />
              <MetadataListItem label="Present address" value={address(m.presentAddress)} />
              <MetadataListItem label="Nominee" value={`${m.nominee.name} (${m.nominee.relation})`} />
            </Card>
          </Section>

          <Section title="Shares & pay">
            <Card>
              <MetadataListItem label="Shares" value={`${p.shares?.numberOfShares ?? m.numberOfShares} · ${formatINR(p.shares?.shareCapital ?? 0)}`} />
              <MetadataListItem label="Share deposit" value={formatINR(p.shares?.shareDepositBalance ?? 0)} />
              <MetadataListItem label="Gross salary" value={formatINR(m.payProfile.grossSalary)} />
              <MetadataListItem label="Scale of pay" value={m.payProfile.scaleOfPay || '—'} />
              <Text type="supporting" tone="secondary">
                {m.payProfile.certifiedAt ? `Last certified by your DDO on ${formatDisplayDate(m.payProfile.certifiedAt)}.` : 'Not certified yet.'}
              </Text>
            </Card>
          </Section>

          <Section title="My agreements">
            <Card>
              <View style={styles.rowIcon}>
                {p.mandate?.status === 'AGREED' ? <BadgeCheck size={22} color={color.status.success.text} /> : <ShieldAlert size={22} color={color.status.warning.text} />}
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="label">Salary recovery agreement</Text>
                  <Text type="supporting" tone="secondary">
                    {p.mandate ? `Signed ${formatDisplayDate(p.mandate.signedOn)}${p.mandate.status === 'AGREED' ? ` · agreed by ${p.mandate.agreedByName ?? 'your DDO'}${p.mandate.agreedOn ? ` on ${formatDisplayDate(p.mandate.agreedOn)}` : ''}` : ' · waiting for your new DDO to agree'}` : 'Not on record'}
                  </Text>
                </View>
              </View>
              <Divider />
              <View style={[styles.rowIcon, { paddingTop: spacing[2] }]}>
                <BadgeCheck size={22} color={color.status.success.text} />
                <View style={{ flex: 1, gap: spacing[0.5] }}>
                  <Text type="label">Bye-laws and declarations</Text>
                  <Text type="supporting" tone="secondary">
                    Accepted when you joined on {formatDisplayDate(m.joinedSocietyOn)}
                  </Text>
                </View>
              </View>
            </Card>
          </Section>

          <Section title="Service history">
            <Card>
              <View style={{ gap: spacing[3] }}>
                {(allHistory ? p.serviceEvents : p.serviceEvents.slice(0, 3)).map((e) => (
                  <View key={e.id} style={{ gap: spacing[0.5] }}>
                    <Text type="label">{e.summary}</Text>
                    <Text type="supporting" tone="secondary">
                      {formatDisplayDate(e.date)}
                      {e.effectiveCycle ? ` · demand from ${formatCycle(e.effectiveCycle)}` : ''}
                    </Text>
                  </View>
                ))}
                {p.serviceEvents.length > 3 ? <Link label={allHistory ? 'Show less' : `Show all ${p.serviceEvents.length}`} iconEnd={allHistory ? ChevronUp : ChevronDown} onPress={() => setAllHistory((v) => !v)} /> : null}
              </View>
            </Card>
          </Section>

          <Section title="Documents" description="Kept by the society office.">
            <Card padded={false}>
              {p.documents.map((d, i) => (
                <View key={d.type} style={[styles.docRow, i > 0 && styles.divider]}>
                  <FileText size={20} color={color.accent} />
                  <View style={{ flex: 1 }}>
                    <Text type="label">{d.label}</Text>
                    <Text type="supporting" tone="secondary">
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
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: color.accent, borderRadius: radius.container, padding: spacing[4] },
  initials: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.accentTile, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing[2] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rowIcon: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], paddingBottom: spacing[2] },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
});
