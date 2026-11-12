// F-01 (D-096): the user's signature on file. It appears on every form they sign with an OTP;
// signing is refused until one is uploaded. A PNG from the photo library, at most 200 KB; the
// app sends the file's own bytes and the server checks and encrypts them.
import { useState } from 'react';
import { Image, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react-native';
import { isApiError } from '@tgs/api-client';
import { formatDisplayDateTime } from '@tgs/domain';
import { api } from '@/lib/api';
import { readBase64 } from '@/lib/files';
import { Alert, Button, Card, Skeleton, Text } from '@/ui';
import { radius, space } from '@/theme';

export const signatureKey = ['my-signature'] as const;
const MAX_BYTES = 200 * 1024;

export function SignatureCard({ purpose }: { purpose?: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: signatureKey, queryFn: api.signatures.mine });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const pick = async () => {
    setError(undefined);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = res.canceled ? undefined : res.assets?.[0];
    if (!asset) return;
    if (asset.mimeType && asset.mimeType !== 'image/png') return setError('Choose a PNG image of your signature.');
    if (asset.fileSize && asset.fileSize > MAX_BYTES) return setError('The file is larger than 200 KB.');
    setBusy(true);
    try {
      qc.setQueryData(signatureKey, await api.signatures.upload(await readBase64(asset)));
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
          {purpose ?? 'It appears on every form you sign with a code.'} A PNG of your signature on plain paper, at most 200 KB.
        </Text>
        {s ? (
          <Image source={{ uri: s.dataUrl }} accessibilityLabel="Your signature" resizeMode="contain" style={{ height: 80, width: '100%' }} />
        ) : (
          <Alert type="warning" heading="No signature yet" description="Upload one before you sign." />
        )}
        {s && (
          <Text role="caption" tone="tertiary">
            Uploaded {formatDisplayDateTime(s.uploadedAt)}. Forms you already signed keep the signature they were signed with.
          </Text>
        )}
        {error && <Alert type="error" heading="Not saved" description={error} />}
        <Button text={s ? 'Replace signature' : 'Upload signature'} buttonType={s ? 'secondary' : 'primary'} leftSlot={FileUp} loading={busy} onPress={() => void pick()} />
      </View>
    </Card>
  );
}
