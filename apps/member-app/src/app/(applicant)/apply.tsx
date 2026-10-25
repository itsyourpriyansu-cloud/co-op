// MJ-04 Membership application (form F1 + agreement F6), 7 steps, autosaved, signed with OTP.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CircleCheck, FileText, FileUp, PenLine } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { amountInWords, formatDisplayDate, formatINR, validateMembershipForm } from '@tgs/domain';
import type { JoiningReference, MembershipDocumentType, MembershipForm, Nominee } from '@tgs/types';
import { api } from '@/lib/api';
import { errorsForStep, firstIncompleteStep, STEPS, useJoiningReference, useMyApplication, useSaveDraft } from '@/lib/joining';
import { Alert, Button, Card, Checkbox, ChoiceCard, DateField, Divider, Header, KeyValue, NumberStepper, OtpInput, Screen, Segmented, SelectField, Skeleton, Text, TextField, WizardProgress } from '@/ui';
import { color, radius, space } from '@/theme';

type Update = (patch: MembershipForm) => void;
type StepProps = { form: MembershipForm; update: Update; errors: Record<string, string>; reference: JoiningReference };

const RELATIONS: Array<Nominee['relation']> = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
const FIELD_STEP: Record<string, number> = { personal: 0, address: 1, employment: 2, shares: 3, nominee: 3, documents: 4, declarations: 5 };

/** Merge a section patch into the local form (sections are shallow objects). */
function merge(form: MembershipForm, patch: MembershipForm): MembershipForm {
  const out: Record<string, unknown> = { ...form };
  for (const [k, v] of Object.entries(patch)) {
    const prev = (form as Record<string, unknown>)[k];
    out[k] = Array.isArray(v) || typeof v !== 'object' || v === null ? v : { ...((prev as object) ?? {}), ...v };
  }
  return out as MembershipForm;
}

export default function Apply() {
  const params = useLocalSearchParams<{ step?: string }>();
  const reference = useJoiningReference();
  const mine = useMyApplication();
  const save = useSaveDraft();
  const [form, setForm] = useState<MembershipForm | null>(null);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [signing, setSigning] = useState<{ otpRef: string; demoOtp?: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const required = useMemo(() => (reference.data?.requiredDocuments ?? []).filter((d) => d.required), [reference.data]);
  const app = mine.data;

  // Initialise once from the saved draft; resume at the first incomplete step (or the step asked for).
  useEffect(() => {
    if (!app || form) return;
    if (app.status !== 'DRAFT' && app.status !== 'INFO_REQUESTED') {
      router.replace('/tracker');
      return;
    }
    const initial = app.form ?? {};
    setForm(initial);
    const requested = app.infoRequest ? FIELD_STEP[app.infoRequest.field.split('.')[0] ?? ''] : undefined;
    const asked = params.step ? Number(params.step) : undefined;
    setStep(asked ?? requested ?? firstIncompleteStep(validateMembershipForm(initial, required)));
  }, [app, form, params.step, required]);

  if (!form || !reference.data || !app) {
    return (
      <Screen header={<Header title="Membership application" />}>
        <Skeleton height={8} />
        <Skeleton height={32} width="70%" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={56} radius={radius.control} />
        ))}
      </Screen>
    );
  }

  const allErrors = validateMembershipForm(form, required);
  const stepErrors = errorsForStep(allErrors, step);
  const visible = showErrors ? stepErrors : {};
  const update: Update = (patch) => setForm((f) => merge(f ?? {}, patch));
  const isReview = step === STEPS.length - 1;

  const persistStep = async () => {
    const keys = STEPS[step]?.prefixes.map((p) => p.replace('.', '')) ?? [];
    const patch = Object.fromEntries(keys.map((k) => [k, (form as Record<string, unknown>)[k]]).filter(([, v]) => v !== undefined)) as MembershipForm;
    if (Object.keys(patch).length) await save.mutateAsync(patch);
  };

  const next = async () => {
    setServerError(null);
    if (Object.keys(stepErrors).length) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      await persistStep();
      setShowErrors(false);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') return router.push('/offline');
      setServerError(isApiError(e) ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setShowErrors(false);
    if (step === 0) router.replace('/tracker');
    else setStep((s) => s - 1);
  };

  const startSigning = async () => {
    setServerError(null);
    if (Object.keys(allErrors).length) {
      setShowErrors(true);
      setStep(firstIncompleteStep(allErrors));
      return;
    }
    setBusy(true);
    try {
      const otp = await api.membership.requestSign();
      setSigning({ otpRef: otp.otpRef, demoOtp: otp.demoOtp });
    } catch (e) {
      setServerError(isApiError(e) ? e.message : 'Could not start signing.');
    } finally {
      setBusy(false);
    }
  };

  const props: StepProps = { form, update, errors: visible, reference: reference.data };
  const current = STEPS[step];

  return (
    <Screen
      header={<Header title="Membership application" onBack={back} right={save.isPending ? <ActivityIndicator size="small" color={color.text.tertiary} /> : null} />}
      footer={
        isReview ? (
          <Button text="Sign & submit" leftSlot={PenLine} size="lg" fullWidth loading={busy} onPress={() => void startSigning()} />
        ) : (
          <Button text="Save & continue" size="lg" fullWidth loading={busy} onPress={() => void next()} />
        )
      }
    >
      <View style={{ gap: space[8] }}>
        <WizardProgress step={step + 1} total={STEPS.length} title={current?.title ?? ''} />
        <Text role="pageTitle">{current?.title}</Text>
      </View>

      {app.status === 'INFO_REQUESTED' && app.infoRequest ? (
        <Alert type="warning" heading={`${app.infoRequest.by === 'DDO' ? 'Your department' : 'The society office'} needs a correction`} description={app.infoRequest.message} />
      ) : null}
      {showErrors && Object.keys(stepErrors).length ? <Alert type="error" heading="A few details are missing" description="Fill the highlighted fields to continue." /> : null}
      {serverError ? <Alert type="error" heading="Something went wrong" description={serverError} /> : null}

      {step === 0 && <PersonalStep {...props} />}
      {step === 1 && <AddressStep {...props} />}
      {step === 2 && <EmploymentStep {...props} />}
      {step === 3 && <SharesStep {...props} />}
      {step === 4 && <DocumentsStep {...props} />}
      {step === 5 && <AgreementsStep {...props} />}
      {isReview && <ReviewStep {...props} errors={allErrors} goTo={(s) => setStep(s)} />}

      <SignSheet
        signing={signing}
        onClose={() => setSigning(null)}
        onSigned={() => {
          setSigning(null);
          router.replace({ pathname: '/tracker', params: { submitted: '1' } });
        }}
      />
    </Screen>
  );
}

// ---- Step 1 · About you ----------------------------------------------------------------------
function PersonalStep({ form, update, errors }: StepProps) {
  const p = form.personal ?? {};
  return (
    <View style={styles.fields}>
      <TextField label="Full name" required value={p.fullName ?? ''} onChangeText={(v) => update({ personal: { fullName: v } })} autoCapitalize="words" hint="As in your service records" error={errors['personal.fullName']} />
      <TextField label="Father's name" required value={p.fatherName ?? ''} onChangeText={(v) => update({ personal: { fatherName: v } })} autoCapitalize="words" error={errors['personal.fatherName']} />
      <DateField label="Date of birth" required value={p.dob} onChange={(iso) => update({ personal: { dob: iso } })} error={errors['personal.dob']} />
      <Segmented label="Gender" value={p.gender} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} onChange={(v) => update({ personal: { gender: v } })} error={errors['personal.gender']} />
      <TextField label="Mobile number" value={p.mobile ? `+91 ${p.mobile}` : ''} editable={false} hint="Verified with OTP" />
      <TextField label="Email (optional)" value={p.email ?? ''} onChangeText={(v) => update({ personal: { email: v } })} keyboardType="email-address" autoCapitalize="none" error={errors['personal.email']} />
    </View>
  );
}

// ---- Step 2 · Address --------------------------------------------------------------------------
function AddressFields({ prefix, value, onChange, errors }: { prefix: 'present' | 'permanent'; value: Record<string, string | undefined>; onChange: (v: Record<string, string>) => void; errors: Record<string, string> }) {
  const e = (k: string) => errors[`address.${prefix}.${k}`];
  return (
    <View style={styles.fields}>
      <TextField label="House no. and street" required value={value.line1 ?? ''} onChangeText={(v) => onChange({ line1: v })} error={e('line1')} />
      <TextField label="Area / landmark (optional)" value={value.line2 ?? ''} onChangeText={(v) => onChange({ line2: v })} />
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <TextField label="City / town" required value={value.city ?? ''} onChangeText={(v) => onChange({ city: v })} error={e('city')} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="PIN code" required={prefix === 'present'} value={value.pincode ?? ''} onChangeText={(v) => onChange({ pincode: v.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" error={e('pincode')} />
        </View>
      </View>
      <TextField label="District" value={value.district ?? ''} onChangeText={(v) => onChange({ district: v })} />
    </View>
  );
}

function AddressStep({ form, update, errors }: StepProps) {
  const a = form.address ?? {};
  return (
    <View style={{ gap: space[12] }}>
      <View style={{ gap: space[6] }}>
        <Text role="cardTitle">Present address</Text>
        <AddressFields prefix="present" value={a.present ?? {}} onChange={(v) => update({ address: { present: { ...a.present, ...v } } })} errors={errors} />
      </View>
      <Divider />
      <Checkbox checked={!!a.sameAsPresent} onChange={(v) => update({ address: { sameAsPresent: v } })} label="Permanent address is the same" />
      {!a.sameAsPresent ? (
        <View style={{ gap: space[6] }}>
          <Text role="cardTitle">Permanent address</Text>
          <AddressFields prefix="permanent" value={a.permanent ?? {}} onChange={(v) => update({ address: { permanent: { ...a.permanent, ...v } } })} errors={errors} />
        </View>
      ) : null}
    </View>
  );
}

// ---- Step 3 · Employment -----------------------------------------------------------------------
function EmploymentStep({ form, update, errors, reference }: StepProps) {
  const e = form.employment ?? {};
  const probationer = e.employmentType === 'APPROVED_PROBATIONER';
  return (
    <View style={styles.fields}>
      <SelectField label="Department" required searchable value={e.departmentId} options={reference.departments.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => update({ employment: { departmentId: v } })} hint="Your department officer (DDO) will verify this" error={errors['employment.departmentId']} />
      <SelectField label="Designation" required value={e.designation} options={reference.designations.map((d) => ({ value: d, label: d }))} onChange={(v) => update({ employment: { designation: v } })} error={errors['employment.designation']} />
      <TextField label="Employee ID (optional)" value={e.employeeId ?? ''} onChangeText={(v) => update({ employment: { employeeId: v.toUpperCase() } })} autoCapitalize="characters" />
      <View style={{ gap: space[4] }}>
        <Text role="label">
          Appointment type<Text role="label" tone="danger"> *</Text>
        </Text>
        <ChoiceCard title="Regular appointment" description="Appointed regularly in a Secretariat department" selected={e.employmentType === 'REGULAR'} onPress={() => update({ employment: { employmentType: 'REGULAR' } })} />
        <ChoiceCard title="Approved probationer" description="Completed probation; service is counted" selected={probationer} onPress={() => update({ employment: { employmentType: 'APPROVED_PROBATIONER' } })} />
        {errors['employment.employmentType'] ? (
          <Text role="caption" tone="danger">
            Choose your appointment type
          </Text>
        ) : null}
      </View>
      <DateField label={probationer ? 'Date of appointment' : 'Date of regular appointment'} required value={e.regularAppointmentDate} onChange={(iso) => update({ employment: { regularAppointmentDate: iso } })} error={errors['employment.regularAppointmentDate']} />
      {probationer ? (
        <TextField label="Total service in the Secretariat (months)" required value={e.probationServiceMonths ? String(e.probationServiceMonths) : ''} onChangeText={(v) => update({ employment: { probationServiceMonths: v ? Number(v.replace(/\D/g, '')) : undefined } })} keyboardType="number-pad" error={errors['employment.probationServiceMonths']} />
      ) : null}
    </View>
  );
}

// ---- Step 4 · Shares & nominee -----------------------------------------------------------------
function SharesStep({ form, update, errors, reference }: StepProps) {
  const shares = form.shares?.sharesProposed ?? reference.minShares;
  const amount = shares * reference.shareValue;
  const n = form.nominee ?? {};
  useEffect(() => {
    if (form.shares?.sharesProposed === undefined) update({ shares: { sharesProposed: reference.minShares } });
  }, [form.shares?.sharesProposed, reference.minShares, update]);
  return (
    <View style={{ gap: space[12] }}>
      <Card>
        <View style={{ gap: space[6] }}>
          <Text role="cardTitle">Shares</Text>
          <Text role="caption" tone="secondary">
            Each share is {formatINR(reference.shareValue)}. Choose between {reference.minShares} and {reference.maxShares}.
          </Text>
          <NumberStepper value={shares} min={reference.minShares} max={reference.maxShares} step={5} onChange={(v) => update({ shares: { sharesProposed: v } })} accessibilityLabel="Number of shares" />
          <View>
            <Text role="metric">{formatINR(amount)}</Text>
            <Text role="caption" tone="tertiary">
              {amountInWords(amount)}
            </Text>
          </View>
        </View>
      </Card>
      <View style={styles.fields}>
        <Text role="cardTitle">Nominee</Text>
        <Text role="caption" tone="secondary">
          The person who receives your share and deposits in the event of your death.
        </Text>
        <TextField label="Nominee's full name" required value={n.name ?? ''} onChangeText={(v) => update({ nominee: { name: v } })} autoCapitalize="words" error={errors['nominee.name']} />
        <SelectField label="Relationship" required value={n.relation} options={RELATIONS.map((r) => ({ value: r, label: r }))} onChange={(v) => update({ nominee: { relation: v as Nominee['relation'] } })} error={errors['nominee.relation']} />
        <TextField label="Nominee's address (optional)" value={n.address ?? ''} onChangeText={(v) => update({ nominee: { address: v } })} multiline />
      </View>
    </View>
  );
}

// ---- Step 5 · Documents (simulated upload in the prototype) ------------------------------------
function DocumentsStep({ form, update, errors, reference }: StepProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const docs = form.documents ?? [];
  const upload = (type: MembershipDocumentType) => {
    setUploading(type);
    setTimeout(() => {
      const fileName = `${type.toLowerCase().replace(/_/g, '-')}.${type === 'PHOTO' ? 'jpg' : 'pdf'}`;
      update({ documents: [...docs.filter((d) => d.type !== type), { type, fileName, uploadedAt: new Date().toISOString() }] });
      setUploading(null);
    }, 700);
  };
  return (
    <View style={{ gap: space[6] }}>
      <Alert type="neutral" heading="Clear photos or PDFs" description="Prototype: tapping Upload attaches a sample file. The real app opens the camera or file picker." />
      {reference.requiredDocuments.map((d) => {
        const done = docs.find((x) => x.type === d.type);
        const err = errors[`documents.${d.type}`];
        return (
          <Card key={d.type} style={err ? { borderColor: color.status.danger.solid } : undefined}>
            <View style={styles.docRow}>
              <View style={[styles.docIcon, done && { backgroundColor: color.status.success.bg }]}>
                {done ? <CircleCheck size={22} color={color.status.success.fg} /> : d.type === 'PHOTO' ? <Camera size={22} color={color.brand.solid} /> : <FileText size={22} color={color.brand.solid} />}
              </View>
              <View style={{ flex: 1, gap: space[1] }}>
                <Text role="bodyStrong">
                  {d.label}
                  {d.required ? <Text role="bodyStrong" tone="danger"> *</Text> : <Text role="caption" tone="tertiary"> (optional)</Text>}
                </Text>
                <Text role="caption" tone={err ? 'danger' : done ? 'success' : 'tertiary'}>
                  {err ?? (done ? done.fileName : d.hint)}
                </Text>
              </View>
              <Button text={done ? 'Replace' : 'Upload'} buttonType="secondary" size="sm" leftSlot={done ? undefined : FileUp} loading={uploading === d.type} onPress={() => upload(d.type as MembershipDocumentType)} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

// ---- Step 6 · Declarations & salary recovery agreement -----------------------------------------
const DECL_FIELD = { byelaws: 'byelawsAccepted', noOtherSociety: 'noOtherSociety', recoveryMandate: 'recoveryMandateAccepted' } as const;

function AgreementsStep({ form, update, errors, reference }: StepProps) {
  const [open, setOpen] = useState<string | null>(null);
  const d = form.declarations ?? {};
  return (
    <View style={{ gap: space[8] }}>
      <Text role="body" tone="secondary">
        Read the key points. You sign all three together with an OTP at the end.
      </Text>
      {reference.agreements.map((a) => {
        const field = DECL_FIELD[a.key];
        const err = errors[`declarations.${field}`];
        return (
          <Card key={a.key} style={err ? { borderColor: color.status.danger.solid } : undefined}>
            <View style={{ gap: space[6] }}>
              <Text role="cardTitle">{a.title}</Text>
              <View style={{ gap: space[3] }}>
                {a.summary.map((s) => (
                  <View key={s} style={{ flexDirection: 'row', gap: space[4] }}>
                    <Text role="body" tone="tertiary">
                      •
                    </Text>
                    <Text role="body" tone="secondary" style={{ flex: 1 }}>
                      {s}
                    </Text>
                  </View>
                ))}
              </View>
              <Button text={open === a.key ? 'Hide full text' : 'Read full text'} subType="inline" onPress={() => setOpen(open === a.key ? null : a.key)} />
              {open === a.key ? (
                <View style={styles.legal}>
                  <Text role="caption" tone="secondary">
                    {a.text}
                  </Text>
                </View>
              ) : null}
              <Divider />
              <Checkbox checked={!!d[field]} onChange={(v) => update({ declarations: { [field]: v } })} label="I agree" description={err} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

// ---- Step 7 · Review --------------------------------------------------------------------------
function ReviewStep({ form, errors, reference, goTo }: StepProps & { goTo: (step: number) => void }) {
  const dept = reference.departments.find((d) => d.id === form.employment?.departmentId)?.name ?? '—';
  const missing = Object.keys(errors).length;
  const block = (title: string, step: number, rows: Array<[string, string | undefined]>) => (
    <Card key={title}>
      <View style={styles.reviewHead}>
        <Text role="cardTitle" style={{ flex: 1 }}>
          {title}
        </Text>
        <Button text="Edit" subType="inline" onPress={() => goTo(step)} />
      </View>
      {rows.map(([k, v]) => (
        <KeyValue key={k} label={k} value={v || '—'} />
      ))}
    </Card>
  );
  const a = form.address?.present;
  return (
    <View style={{ gap: space[8] }}>
      {missing ? <Alert type="warning" heading={`${missing} detail${missing === 1 ? '' : 's'} still missing`} description="Tap Edit on the section, or Sign & submit to jump to the first one." /> : <Alert type="success" heading="Everything looks complete" description="Check your details, then sign with OTP." />}
      {block('About you', 0, [
        ['Full name', form.personal?.fullName],
        ["Father's name", form.personal?.fatherName],
        ['Date of birth', form.personal?.dob ? formatDisplayDate(form.personal.dob) : undefined],
        ['Mobile', form.personal?.mobile ? `+91 ${form.personal.mobile}` : undefined],
      ])}
      {block('Address', 1, [['Present', a ? [a.line1, a.city, a.pincode].filter(Boolean).join(', ') : undefined], ['Permanent', form.address?.sameAsPresent ? 'Same as present' : form.address?.permanent?.line1]])}
      {block('Employment', 2, [
        ['Department', dept],
        ['Designation', form.employment?.designation],
        ['Appointment', form.employment?.employmentType === 'APPROVED_PROBATIONER' ? 'Approved probationer' : form.employment?.employmentType ? 'Regular' : undefined],
        ['Appointed on', form.employment?.regularAppointmentDate ? formatDisplayDate(form.employment.regularAppointmentDate) : undefined],
      ])}
      {block('Shares & nominee', 3, [
        ['Shares', form.shares?.sharesProposed ? `${form.shares.sharesProposed} × ${formatINR(reference.shareValue)} = ${formatINR(form.shares.sharesProposed * reference.shareValue)}` : undefined],
        ['Nominee', form.nominee?.name ? `${form.nominee.name} (${form.nominee.relation ?? '—'})` : undefined],
      ])}
      {block('Documents', 4, [['Uploaded', `${form.documents?.length ?? 0} of ${reference.requiredDocuments.length}`]])}
      {block('Declarations', 5, [['Signed with OTP', 'Bye-laws · No other society · Salary recovery']])}
    </View>
  );
}

// ---- Sign with OTP (D-031) --------------------------------------------------------------------
function SignSheet({ signing, onClose, onSigned }: { signing: { otpRef: string; demoOtp?: string } | null; onClose: () => void; onSigned: () => void }) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOtp('');
    setError(undefined);
  }, [signing]);
  const confirm = async (code = otp) => {
    if (!signing || code.length !== 6) return;
    setBusy(true);
    try {
      await api.membership.submit(signing.otpRef, code);
      onSigned();
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not sign.');
      setOtp('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!signing} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cancel signing" />
      <View style={styles.sheet}>
        <View style={{ gap: space[3] }}>
          <Text role="sectionTitle">Sign with OTP</Text>
          <Text role="body" tone="secondary">
            Entering the code signs your application, the declarations and the salary recovery agreement.
          </Text>
        </View>
        <OtpInput
          value={otp}
          error={error}
          onChange={(v) => {
            setOtp(v);
            if (v.length === 6) void confirm(v);
          }}
        />
        {signing?.demoOtp ? <Alert type="neutral" heading={`Demo code: ${signing.demoOtp}`} /> : null}
        <Button text="Sign & submit" size="lg" fullWidth loading={busy} disabled={otp.length !== 6} onPress={() => void confirm()} />
        <Button text="Cancel" subType="inline" onPress={onClose} style={{ alignSelf: 'center' }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space[10] },
  row2: { flexDirection: 'row', gap: space[6] },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: space[6] },
  docIcon: { width: 44, height: 44, borderRadius: radius.control, backgroundColor: color.brand.subtle, alignItems: 'center', justifyContent: 'center' },
  legal: { padding: space[6], borderRadius: radius.control, backgroundColor: color.bg.surfaceMuted },
  reviewHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space[2] },
  backdrop: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: { backgroundColor: color.bg.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space[12], gap: space[8] },
});
