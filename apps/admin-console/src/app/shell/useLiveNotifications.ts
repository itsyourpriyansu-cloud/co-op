// G9 (D-121): live notifications. The open tab keeps one server-sent events stream; each new
// notification refreshes the bell and the lists and shows a snackbar. The 20 s poll stays as the fallback.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addSnackbarV2, SnackbarV2Variant } from '@juspay/blend-design-system';
import { api } from '@/lib/api';

export function useLiveNotifications(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    void (async () => {
      let wait = 2_000;
      while (!ac.signal.aborted) {
        const opened = Date.now();
        try {
          await api.notifications.stream((event, data) => {
            if (event !== 'notification') return;
            void qc.invalidateQueries({ queryKey: ['notification-count'] });
            void qc.invalidateQueries({ queryKey: ['staff-notifications'] });
            addSnackbarV2({
              header: (data as { title?: string }).title ?? 'New notification',
              variant: SnackbarV2Variant.INFO,
            });
          }, ac.signal);
        } catch {
          // Offline or the server restarted: try again with backoff.
        }
        // A stream that stayed up a while ended normally (15-minute limit): reconnect at once.
        wait = Date.now() - opened > 60_000 ? 2_000 : Math.min(wait * 2, 60_000);
        await new Promise((r) => setTimeout(r, wait));
      }
    })();
    return () => ac.abort();
  }, [enabled, qc]);
}
