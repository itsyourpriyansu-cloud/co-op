// ST-15m Application detail: the digital form, documents, declarations, checks, activity and sign-offs.
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react-native';
import { formatDisplayDate, formatDisplayDateTime, formatINR } from '@tgs/domain';
import { ROLE_LABELS, type MembershipDetail, type Role, type WorkflowEvent } from '@tgs/types';
import { Expand, Loaded, PrintButton, RuleChecks } from '@/components/staff';
import { api } from '@/lib/api';
import { ACTION_HINT, ACTION_LABEL, certItems, EVENT_TITLE, isPrimaryAction, STEPS } from '@/lib/staffJoining';
import { Alert, Button, Card, Header, KeyValue, Screen, Section, StageTracker, StatusTag, Tag, Text } from '@/ui';
import { color, space } from '@/theme';

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? (r === 'APPLICANT' ? 'Applicant' : r.charAt(0) + r.slice(1).toLowerCase());

function stages(d: MembershipDetail) {
  const app = d.application;
  const returnedFrom = [...app.events].reverse().find((e) => e.toStatus === 'INFO_REQUESTED')?.fromStatus;
  const at = app.status === 'INFO_REQUESTED' ? returnedFrom : app.status === 'REJECTED' ? app.events.at(-1)?.fromStatus : app.status;
  const idx = STEPS.findIndex((s) => s.status === at);
  return STEPS.map((s, i) => ({
    key: s.status,
    title: s.title,
    status: app.status === 'ACTIVE' || i < idx ? ('done' as const) : i === idx ? (app.status === 'REJECTED' ? ('failed' as const) : app.status === 'INFO_REQUESTED' ? ('attention' as const) : ('current' as const)) : ('todo' as const),
  }));
}

function eventStatus(e: WorkflowEvent) {
  if (e.toStatus === 'REJECTED') return 'failed' as const;
  if (e.toStatus === 'INFO_REQUESTED') return 'attention' as const;
  return 'done' as const;
}

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['membership-application', id], queryFn: () => api.applications.get(id), refetchInterval: 20_000 });
  return (
    <Loaded page q={q} what="this application">
      {(d) => <Body d={d} refetching={q.isRefetching} refetch={() => void q.refetch()} />}
    </Loaded>
  );
}

function Body({ d, refetching, refetch }: { d: MembershipDetail; refetching: boolean; refetch: () => void }) {
  const app = d.application;
  const f = app.form ?? {};
  const perm = f.address?.sameAsPresent ? 'Same as present address' : [f.address?.permanent?.line1, f.address?.permanent?.city, f.address?.permanent?.pincode].filter(Boolean).join(', ');
  const docs = f.documents ?? [];
  const decl = f.declarations ?? {};
  const accepted = { byelaws: decl.byelawsAccepted, noOtherSociety: decl.noOtherSociety, recoveryMandate: decl.recoveryMandateAccepted };
  const failing = d.checks.filter((c) => !c.pass).length;
  const primary = d.actions.find(isPrimaryAction);
  const secondary = d.actions.filter((a) => !isPrimaryAction(a));
  const open = (a: string) => router.push(`/staff/joining/${app.id}/${a}`);
  const signOffs: Array<{ label: string; s?: { byName: string; at: string } | undefined }> = [
    { label: 'Intake', s: app.intake },
    { label: 'DDO certificate', s: app.ddoCertification },
    { label: 'Office review', s: app.officeReview },
    { label: 'Secretary', s: app.secretaryApproval },
    { label: 'President', s: app.presidentApproval },
    { label: 'Share payment', s: app.shareReceipt ? { byName: app.shareReceipt.byName, at: app.shareReceipt.at } : undefined },
  ];

  return (
    <Screen
      header={<Header title="Application" onBack={() => router.back()} />}
      refreshing={refetching}
      onRefresh={refetch}
      {...(d.actions.length
        ? {
            footer: (
              <View style={{ gap: space[3] }}>
                {primary ? <Button text={ACTION_LABEL[primary]} size="lg" fullWidth onPress={() => open(primary)} /> : null}
                {secondary.length ? (
                  <View style={{ flexDirection: 'row', gap: space[4] }}>
                    {secondary.map((a) => (
                      <Button key={a} text={ACTION_LABEL[a]} buttonType="secondary" style={{ flex: 1 }} onPress={() => open(a)} />
                    ))}
                  </View>
                ) : null}
              </View>
            ),
          }
        : {})}
    >
      <View style={{ gap: space[2] }}>
        <Text role="pageTitle">{app.name}</Text>
        <Text role="caption" tone="secondary">
          {app.applicationNo} · {app.designation} · {d.department?.name}
          {app.submittedOn ? ` · submitted ${formatDisplayDate(app.submittedOn)}` : ''}
        </Text>
        <StatusTag entity="membership" status={app.status} audience="staff" />
      </View>

      {app.status === 'INFO_REQUESTED' && app.infoRequest ? <Alert type="warning" heading={`Returned to the applicant by ${app.infoRequest.by === 'DDO' ? 'the DDO' : 'the office'}`} description={app.infoRequest.message} /> : null}
      {app.status === 'REJECTED' ? <Alert type="error" heading={`Rejected${app.rejection ? ` by ${app.rejection.byName}` : ''}`} description={app.rejection?.remarks ?? 'No reason recorded.'} /> : null}
      {app.status === 'ACTIVE' ? <Alert type="success" heading={`Member · General No. ${app.allottedGeneralNo ?? ''}`} description={app.shareReceipt ? (app.shareReceipt.mode === 'FIRST_DEMAND' ? 'Shares will be recovered on the first demand sheet.' : `Shares paid · receipt ${app.shareReceipt.receiptNo}`) : 'Member record created.'} /> : null}

      <Section title="Next step">
        <Card>
          {d.actions.length ? (
            <View style={{ gap: space[3] }}>
              <Tag text="Your turn" color="primary" />
              <Text role="body" tone="secondary">
                {ACTION_HINT[primary ?? d.actions[0]!]}
              </Text>
            </View>
          ) : d.waitingOn ? (
            <Text role="label">Waiting on {d.waitingOn}</Text>
          ) : (
            <Text role="body" tone="secondary">
              {app.status === 'ACTIVE' ? 'Done. The applicant is now a member and sees their General No. in the app.' : 'No further steps.'}
            </Text>
          )}
        </Card>
      </Section>

      <Card>
        <StageTracker stages={stages(d)} />
      </Card>

      <Expand title="Application" initiallyOpen>
        <Text role="overline" tone="tertiary">
          Items 1 to 7 · {app.ddoCertification ? `certified by ${app.ddoCertification.byName}` : 'not certified yet'}
        </Text>
        {certItems(app, d.department?.name ?? '').map((r) => (
          <KeyValue key={r.key} label={`${r.no} · ${r.label}`} value={r.value} />
        ))}
        <KeyValue label="8 · Shares proposed" value={`${app.sharesProposed} · ${formatINR(d.shareAmount)}`} />
        <KeyValue label="Employee ID" value={f.employment?.employeeId ?? '—'} />
        <KeyValue label="9 · Nominee" value={f.nominee?.name ? `${f.nominee.name} (${f.nominee.relation ?? ''})` : '—'} />
        <KeyValue label="Nominee address" value={f.nominee?.address || '—'} />
        <KeyValue label="Permanent address" value={perm || '—'} />
        <KeyValue label="Email" value={f.personal?.email || '—'} />
        <KeyValue label="Gender" value={f.personal?.gender === 'F' ? 'Female' : f.personal?.gender === 'M' ? 'Male' : '—'} />
        <KeyValue label="Caste" value={f.personal?.caste || '—'} />
      </Expand>

      <Expand title="Documents">
        {d.requiredDocuments.map((req) => {
          const doc = docs.find((x) => x.type === req.type);
          return <KeyValue key={req.type} label={req.label} value={doc ? `${doc.fileName} · ${formatDisplayDateTime(doc.uploadedAt)}` : req.required ? 'Missing (required)' : 'Not needed for regular employees'} />;
        })}
      </Expand>

      <Expand title="Declarations">
        {app.signature ? <Alert type="primary" heading={`Signed with OTP by ${f.personal?.fullName ?? app.name}`} description={`${formatDisplayDateTime(app.signature.signedAt)} · mobile ${f.personal?.mobile ?? '—'} · text version ${app.signature.textVersion}`} /> : null}
        {d.agreements.map((a) => (
          <View key={a.key} style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <Text role="label" style={{ flex: 1 }}>
                {a.title}
              </Text>
              {accepted[a.key] ? <CircleCheck size={16} color={color.status.success.fg} accessibilityLabel="Accepted" /> : <Text role="caption" tone="tertiary">Not accepted</Text>}
            </View>
            {a.summary.map((s) => (
              <Text key={s} role="caption" tone="secondary">
                • {s}
              </Text>
            ))}
            {a.key === 'recoveryMandate' && app.ddoCertification?.mandateAgreed ? (
              <Text role="captionStrong" tone="success">
                AGREED by {app.ddoCertification.byName}, {app.ddoCertification.designation}
              </Text>
            ) : null}
          </View>
        ))}
      </Expand>

      <Expand title="Checks" badge={failing ? <Tag text={String(failing)} color="warning" size="xs" /> : undefined}>
        <RuleChecks checks={d.checks} />
      </Expand>

      <Expand title="Sign-offs">
        {signOffs.map((r) => (
          <KeyValue key={r.label} label={r.label} value={r.s ? `${r.s.byName} · ${formatDisplayDateTime(r.s.at)}` : 'Pending'} />
        ))}
      </Expand>

      <Expand title="Activity">
        {app.events.length ? (
          <StageTracker stages={[...app.events].reverse().map((e, i) => ({ key: `${e.at}-${i}`, title: EVENT_TITLE[e.action] ?? e.action, description: `${e.actorName} · ${roleLabel(e.actorRole)}${e.remarks ? `\n“${e.remarks}”` : ''}`, date: formatDisplayDateTime(e.at), status: eventStatus(e) }))} />
        ) : (
          <Text role="caption" tone="tertiary">
            No activity yet.
          </Text>
        )}
      </Expand>

      {app.status !== 'DRAFT' ? <PrintButton text="Print form" path={`/reports/print/membership?application=${app.id}`} /> : null}
    </Screen>
  );
}
