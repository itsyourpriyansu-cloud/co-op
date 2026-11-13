// F-01 (D-096): the user's signature on file. It appears on every form they sign with an OTP;
// signing is refused until one is uploaded. Any photo from the library; the app converts it to a
// PNG under 200 KB (D-122) and the server checks and encrypts it.
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, X } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import { api } from '@/lib/api';
import { toSignaturePng } from '@/lib/files';
import { Alert, Button, Card, Skeleton, Text } from '@/ui';
import { color, radius, space, touchTarget } from '@/theme';

export const signatureKey = ['my-signature'] as const;
const MAX_PICK_BYTES = 25 * 1024 * 1024;

export function SignatureCard({ purpose }: { purpose?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: signatureKey, queryFn: api.signatures.mine });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The converted PNG (base64) waiting for Submit; nothing is sent until then.
  const [pending, setPending] = useState<string>();

  const pick = async () => {
    setError(undefined);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = res.canceled ? undefined : res.assets?.[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_PICK_BYTES) return setError('The file is too large. Choose a picture under 25 MB.');
    setBusy(true);
    try {
      setPending(await toSignaturePng(asset.uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the picture.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!pending) return;
    setError(undefined);
    setBusy(true);
    try {
      qc.setQueryData(signatureKey, await api.signatures.upload(pending));
      setPending(undefined);
    } catch (e) {
      setError(isApiError(e) ? (e.fieldErrors?.png ?? e.message) : e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <Skeleton height={140} radius={radius.card} />;
  const s = q.data;
  return (
    <Card>
      <View style={{ gap: space[3] }}>
        <Text role="cardTitle">My signature</Text>
        <Text role="caption" tone="secondary">
          {purpose ?? 'It appears on every form you sign with a code.'} A photo of your signature on plain white paper (JPG or PNG). It is resized for you.
        </Text>
        {pending ? (
          <View style={{ gap: space[2] }}>
            <View>
              <Image source={{ uri: `data:image/png;base64,${pending}` }} accessibilityLabel="Selected signature, not saved yet" resizeMode="contain" style={{ height: 80, width: '100%' }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Remove selected picture" onPress={() => setPending(undefined)} disabled={busy} hitSlop={8} style={{ position: 'absolute', top: 0, right: 0, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} color={color.text.secondary} />
              </Pressable>
            </View>
            <Text role="caption" tone="tertiary">
              Check this is your signature, then press Submit. Nothing is saved until you do.
            </Text>
          </View>
        ) : s ? (
          <Image source={{ uri: s.dataUrl }} accessibilityLabel="Your signature" resizeMode="contain" style={{ height: 80, width: '100%' }} />
        ) : (
          <Alert type="warning" heading="No signature yet" description="Upload one before you sign." />
        )}
        {s && !pending && (
          <Text role="caption" tone="tertiary">
            Uploaded {formatDisplayDateTime(s.uploadedAt)}. Forms you already signed keep the signature they were signed with.
          </Text>
        )}
        {error && <Alert type="error" heading="Not saved" description={error} />}
        {pending ? (
          <>
            <Button text="Submit" loading={busy} onPress={() => void submit()} />
            <Button text="Choose a different picture" buttonType="secondary" leftSlot={FileUp} disabled={busy} onPress={() => void pick()} />
          </>
        ) : (
          <Button text={s ? 'Replace signature' : 'Upload signature'} buttonType={s ? 'secondary' : 'primary'} leftSlot={FileUp} loading={busy} onPress={() => void pick()} />
        )}
      </View>
    </Card>
  );
}
