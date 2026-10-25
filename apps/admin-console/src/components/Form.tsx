// Form building blocks for console screens (docs/12 §5): labelled Blend inputs that convert
// rupees ↔ paise and show server field errors inline, plus a sticky save bar for edit forms.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ButtonV2, ButtonV2Type, TagV2, TagV2Color, TagV2Size, TagV2SubType, TagV2Type, TextInputV2, TooltipV2 } from '@juspay/blend-design-system';
import { isApiError } from '@tgs/api-client';
import type { Paise } from '@tgs/types';

export type FieldErrors = Record<string, string>;

const err = (errors: FieldErrors | undefined, key: string) => (errors?.[key] ? { show: true, message: errors[key] } : undefined);

/** Rupees in the box, paise in state. Empty box → NaN (validation catches it). */
export function MoneyField({ label, value, onChange, errors, name, hint, disabled, required }: { label: string; value: Paise; onChange: (v: Paise) => void; errors?: FieldErrors; name: string; hint?: string; disabled?: boolean; required?: boolean }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value / 100) : '');
  useEffect(() => {
    setText((t) => (Number(t) * 100 === value ? t : Number.isFinite(value) ? String(value / 100) : ''));
  }, [value]);
  return (
    <TextInputV2
      label={label}
      value={text}
      inputMode="decimal"
      leftSlot={{ slot: <span className="text-body text-fg-tertiary">₹</span> }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        onChange(t === '' ? Number.NaN : Math.round(Number(t) * 100));
      }}
      disabled={disabled}
      required={required}
      error={err(errors, name)}
      {...(hint ? { hintText: hint } : {})}
    />
  );
}

/** Plain number (integers or decimals) with an optional unit shown on the right. */
export function NumberField({ label, value, onChange, errors, name, unit, hint, disabled, decimals = false }: { label: string; value: number; onChange: (v: number) => void; errors?: FieldErrors; name: string; unit?: string; hint?: string; disabled?: boolean; decimals?: boolean }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    setText((t) => (Number(t) === value ? t : Number.isFinite(value) ? String(value) : ''));
  }, [value]);
  return (
    <TextInputV2
      label={label}
      value={text}
      inputMode={decimals ? 'decimal' : 'numeric'}
      {...(unit ? { rightSlot: { slot: <span className="whitespace-nowrap text-caption text-fg-tertiary">{unit}</span> } } : {})}
      onChange={(e) => {
        const t = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');
        setText(t);
        onChange(t === '' ? Number.NaN : Number(t));
      }}
      disabled={disabled}
      error={err(errors, name)}
      {...(hint ? { hintText: hint } : {})}
    />
  );
}

export function TextField({ label, value, onChange, errors, name, hint, disabled, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; errors?: FieldErrors; name: string; hint?: string; disabled?: boolean; placeholder?: string; required?: boolean }) {
  return <TextInputV2 label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} required={required} placeholder={placeholder} error={err(errors, name)} {...(hint ? { hintText: hint } : {})} />;
}

/** Marks a value the society has not confirmed yet (docs/09 placeholders). */
export function PlaceholderTag() {
  return (
    <TooltipV2 content="Working value until the society confirms it. Saving a new value confirms it.">
      <span>
        <TagV2 text="Placeholder" size={TagV2Size.XS} color={TagV2Color.WARNING} type={TagV2Type.SUBTLE} subType={TagV2SubType.ROUNDED} />
      </span>
    </TooltipV2>
  );
}

/** Card section of an edit form with a title, optional tag and body grid. */
export function FormSection({ title, description, tag, children, columns = 2 }: { title: string; description?: string; tag?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3 }) {
  const grid = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 xl:grid-cols-3' }[columns];
  return (
    <section className="rounded-card border border-line bg-surface shadow-raised">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-card-title text-fg">{title}</h2>
          {description && <p className="mt-0.5 max-w-2xl text-caption text-fg-tertiary">{description}</p>}
        </div>
        {tag}
      </header>
      <div className={`grid gap-x-5 gap-y-4 px-5 py-5 ${grid}`}>{children}</div>
    </section>
  );
}

/** Local edit state with dirty tracking and a reset. */
export function useEditable<T>(source: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(source);
  const sourceKey = useMemo(() => JSON.stringify(source ?? null), [source]);
  useEffect(() => {
    setDraft(source);
    // reset whenever the server copy changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);
  const dirty = JSON.stringify(draft ?? null) !== sourceKey;
  return { draft, setDraft, dirty, reset: () => setDraft(source) };
}

/** Field errors from a failed mutation (VALIDATION_ERROR), else empty. */
export function fieldErrorsOf(error: unknown): FieldErrors {
  return isApiError(error) && error.fieldErrors ? error.fieldErrors : {};
}

/** Sticky footer that appears while a form has unsaved changes. */
export function SaveBar({ dirty, saving, onSave, onDiscard, message }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; message?: string }) {
  if (!dirty && !saving) return null;
  return (
    <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-3 shadow-dropdown">
      <span className="text-body text-fg-secondary">{message ?? 'You have unsaved changes.'}</span>
      <div className="flex gap-2">
        <ButtonV2 text="Discard" buttonType={ButtonV2Type.SECONDARY} onClick={onDiscard} disabled={saving} />
        <ButtonV2 text="Save changes" buttonType={ButtonV2Type.PRIMARY} onClick={onSave} loading={saving} />
      </div>
    </div>
  );
}
