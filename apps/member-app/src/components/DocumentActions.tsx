// "Download PDF" and "Print" for a member's own document (lib/documents.ts builds the HTML).
// Download: expo-print makes the PDF, it gets a readable name, and the share sheet lets the member save it
// to Files / Drive or send it. Print: the phone's print dialog (any printer, or "Save as PDF").
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Download, Printer } from 'lucide-react-native';
import { Alert, Button } from '@/ui';
import { space } from '@/theme';

/** Web (used only for testing): open the document on its own and print that, not the whole app. The tab opens before the HTML is ready, so the browser counts it as the tap's pop-up. */
async function printOnWeb(html: string | Promise<string>) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups to print.');
  w.document.write(await html);
  w.document.close();
  w.focus();
  w.print();
}

/** `html` may load data first (staff office copies fill in signatures, D-133). */
export function DocumentActions({ html, fileName, title }: { html: () => string | Promise<string>; fileName: string; title: string }) {
  const [busy, setBusy] = useState<'download' | 'print'>();
  const [error, setError] = useState<string>();

  const run = async (kind: 'download' | 'print', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Try again.');
    } finally {
      setBusy(undefined);
    }
  };

  const download = () =>
    run('download', async () => {
      if (Platform.OS === 'web') return printOnWeb(html());
      const { uri } = await Print.printToFileAsync({ html: await html() });
      const named = new File(Paths.cache, fileName);
      if (named.exists) named.delete();
      await new File(uri).move(named);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone.');
      await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
    });

  const print = () => run('print', async () => (Platform.OS === 'web' ? printOnWeb(html()) : Print.printAsync({ html: await html() })));

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[4] }}>
        <Button text="Download PDF" buttonType="secondary" leftSlot={Download} loading={busy === 'download'} disabled={Boolean(busy)} onPress={() => void download()} style={{ flex: 1 }} accessibilityLabel={`Download PDF of ${title}`} />
        <Button text="Print" buttonType="secondary" leftSlot={Printer} loading={busy === 'print'} disabled={Boolean(busy)} onPress={() => void print()} style={{ flex: 1 }} accessibilityLabel={`Print ${title}`} />
      </View>
      {error ? <Alert type="error" heading="Couldn't make the document" description={error} /> : null}
    </View>
  );
}
