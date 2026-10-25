// MB-19 Edit profile, direct part: email and present address save straight away; a new mobile
// number is confirmed with an OTP sent to it (D-044). Everything else is a request (request.tsx).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Check, Smartphone } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import type { Address, OtpChallenge } from '@tgs/types';
import { api } from '@/lib/api';
import { profileKey, useMyProfile, useUpdateContact } from '@/lib/profile';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Header, OtpInput, Screen, Section, Text, TextField } from '@/ui';
import { space } from '@/theme';

export default function EditProfile() {
  const qc = useQueryClient();
  const profile = useMyProfile();
  const save = useUpdateContact();
  const m = profile.data?.member;
  const [email, setEmail] = useState('');
  const [addr, setAddr] = useState<Address>({ line1: '', city: '', district: '', pincode: '' });
  const [saved, setSaved] = useState(false);
  const [mobile, setMobile] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otp, setOtp] = useState('');
  const [mobileBusy, setMobileBusy] = useState(false);
  const [mobileError, setMobileError] = useState<string>();
  const [mobileDone, setMobileDone] = useState(false);

  // Fill the form once from the server copy (polling must not overwrite what the member types).
  const loaded = Boolean(m);
  useEffect(() => {
    if (!m) return;
    setEmail(m.email ?? '');
    setAddr({ ...m.presentAddress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const errors = isApiError(save.error) ? (save.error.fieldErrors ?? {}) : {};
  const set = (p: Partial<Address>) => setAddr((a) => ({ ...a, ...p }));

  const submit = () => {
    setSaved(false);
    save.mutate({ email: email.trim(), presentAddress: addr }, { onSuccess: () => setSaved(true) });
  };

  const sendOtp = async () => {
    setMobileBusy(true);
    setMobileError(undefined);
    try {
      setChallenge(await api.profile.requestMobileChange(mobile));
    } catch (e) {
      setMobileError(isApiError(e) ? (e.fieldErrors?.mobile ?? e.message) : 'Could not send the code.');
    } finally {
      setMobileBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge) return;
    setMobileBusy(true);
    setMobileError(undefined);
    try {
      const p = await api.profile.verifyMobileChange(challenge.otpRef, otp);
      qc.setQueryData(profileKey, p);
      setMobileDone(true);
      setChallenge(null);
      setOtp('');
      setMobile('');
    } catch (e) {
      setMobileError(isApiError(e) ? (e.fieldErrors?.otp ?? e.message) : 'Could not verify.');
    } finally {
      setMobileBusy(false);
    }
  };

  return (
    <Screen header={<Header title="Edit contact details" onBack={() => router.back()} />}>
      {!m ? (
        <Text role="body" tone="secondary">
          Loading…
        </Text>
      ) : (
        <>
          <Text role="body" tone="secondary">
            These change right away. For your name, dates, designation, nominee or pay, use “Request a change”.
          </Text>
          {saved ? <Alert type="success" heading="Saved" description="Your contact details are updated." /> : null}
          {save.isError && !Object.keys(errors).length ? <Alert type="error" heading="Not saved" description={isApiError(save.error) ? save.error.message : 'Try again.'} /> : null}

          <Section title="Email and address">
            <Card>
              <View style={{ gap: space[8] }}>
                <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} hint="Optional. Used for statements." />
                <TextField label="House / street" value={addr.line1} onChangeText={(v) => set({ line1: v })} error={errors['presentAddress.line1']} required />
                <TextField label="City / town" value={addr.city} onChangeText={(v) => set({ city: v })} error={errors['presentAddress.city']} required />
                <TextField label="District" value={addr.district} onChangeText={(v) => set({ district: v })} />
                <TextField label="PIN code" value={addr.pincode} onChangeText={(v) => set({ pincode: v.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" error={errors['presentAddress.pincode']} required />
                <Button text="Save" leftSlot={Check} fullWidth loading={save.isPending} onPress={submit} />
              </View>
            </Card>
          </Section>

          <Section title="Mobile number" description={`Now ${m.mobileMasked}. We send a code to the new number to confirm it.`}>
            <Card>
              <View style={{ gap: space[8] }}>
                {mobileDone ? <Alert type="success" heading="Mobile number changed" description={`Sign in with ${m.mobileMasked} from now on.`} /> : null}
                {!challenge ? (
                  <>
                    <TextField label="New mobile number" prefix="+91" value={mobile} onChangeText={(v) => setMobile(v.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" error={mobileError} />
                    <Button text="Send code" buttonType="secondary" leftSlot={Smartphone} fullWidth disabled={mobile.length !== 10} loading={mobileBusy} onPress={() => void sendOtp()} />
                  </>
                ) : (
                  <>
                    <Text role="body">Enter the 6-digit code sent to {mobile}.</Text>
                    {challenge.demoOtp ? (
                      <Text role="caption" tone="tertiary">
                        Demo code: {challenge.demoOtp}
                      </Text>
                    ) : null}
                    <OtpInput value={otp} onChange={setOtp} error={mobileError} />
                    <Button text="Confirm new number" fullWidth disabled={otp.length !== 6} loading={mobileBusy} onPress={() => void verify()} />
                    <Button text="Use a different number" buttonType="secondary" subType="inline" onPress={() => setChallenge(null)} />
                  </>
                )}
              </View>
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
