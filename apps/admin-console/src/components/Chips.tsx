// Radio chips: the pattern used inside drawers, where Blend dropdowns render underneath (docs/19).
import { cn } from '@/lib/utils';

export function Chips<T extends string>({ value, options, onChange, label }: { value: T | undefined; options: ReadonlyArray<{ value: T; label: string; hint?: string; disabled?: boolean }>; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-label text-fg">{label}</span>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn('rounded-control border px-4 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', value === o.value ? 'border-brand-border bg-brand-subtle text-brand-text' : 'border-line bg-surface text-fg-secondary hover:bg-surface-subtle')}
          >
            <span className="block text-label">{o.label}</span>
            {o.hint && <span className="block text-caption text-fg-tertiary">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
