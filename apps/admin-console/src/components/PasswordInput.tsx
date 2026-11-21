import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { TextInputV2, type TextInputV2Props } from '@juspay/blend-design-system';

/** A password field with a Show / Hide eye so the user can check for a typo (D-144, as on the phone, D-143). */
export function PasswordInput(props: Omit<TextInputV2Props, 'type' | 'rightSlot'>) {
  const [shown, setShown] = useState(false);
  return (
    <TextInputV2
      {...props}
      type={shown ? 'text' : 'password'}
      rightSlot={{
        slot: (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            title={shown ? 'Hide password' : 'Show password'}
            className="-mr-1.5 flex size-8 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
          >
            {shown ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        ),
      }}
    />
  );
}
