// G1 (D-111): opens an uploaded document for staff. Photos show full screen here; a PDF opens on
// the console, because the phone app has no PDF viewer.
import { useState } from 'react';
import { Image, Linking, Modal, View } from 'react-native';
import type { FileContent } from '@tgs/types';
import { isApiError } from '@tgs/api-client';
import { consoleUrl } from '@/components/staff';
import { api } from '@/lib/api';
import { Banner, Button } from '@/ui';
import { color, spacing } from '@/theme';

export function FileButton({ fileId, mime, consolePath }: { fileId: string; mime?: string; consolePath: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<FileContent>();
  const [error, setError] = useState<string>();
  const image = !mime || mime.startsWith('image/');
  const view = async () => {
    if (!image) return void Linking.openURL(consoleUrl(consolePath));
    setBusy(true);
    setError(undefined);
    try {
      const f = await api.documents.file(fileId);
      if (f.mime.startsWith('image/')) setOpen(f);
      else void Linking.openURL(consoleUrl(consolePath));
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not open the file.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: spacing[1] }}>
      <Button label={image ? 'View' : 'Open PDF'} variant="secondary" size="sm" loading={busy} onPress={() => void view()} />
      {error ? <Banner status="error" heading="Not opened" description={error} /> : null}
      <Modal visible={Boolean(open)} animationType="fade" onRequestClose={() => setOpen(undefined)}>
        <View style={{ flex: 1, backgroundColor: color.background.inverted, padding: spacing[3], gap: spacing[2] }}>
          {open && <Image source={{ uri: open.dataUrl }} accessibilityLabel={open.fileName} resizeMode="contain" style={{ flex: 1 }} />}
          <Button label="Close" variant="secondary" fullWidth onPress={() => setOpen(undefined)} />
        </View>
      </Modal>
    </View>
  );
}
