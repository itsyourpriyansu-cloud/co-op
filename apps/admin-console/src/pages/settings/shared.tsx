// Shared bits for the settings sections.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SnackbarV2Variant, addSnackbarV2 } from '@juspay/blend-design-system';
import type { SettingsBundle } from '@tgs/types';
import { fieldErrorsOf } from '@/components/Form';

export const MONTH_ITEMS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((label, i) => ({ label, value: String(i + 1) }));

export const isPlaceholder = (bundle: SettingsBundle, key: string) => bundle.settings.placeholders.some((p) => p === key || p.startsWith(`${key}.`));

/** Save a settings change: refresh the bundle and the rate card, toast the result. */
export function useSettingsSave<A>(fn: (arg: A) => Promise<unknown>, success: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'settings' in data) qc.setQueryData(['settings'], data);
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['rates'] });
      addSnackbarV2({ header: success, description: 'Recorded in the change history.', variant: SnackbarV2Variant.SUCCESS });
    },
    onError: (e) => {
      if (!Object.keys(fieldErrorsOf(e)).length) addSnackbarV2({ header: "Couldn't save", description: e instanceof Error ? e.message : 'Try again.', variant: SnackbarV2Variant.ERROR });
    },
  });
  return { ...m, fieldErrors: fieldErrorsOf(m.error) };
}
