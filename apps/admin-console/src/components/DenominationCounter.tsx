// BR-029 cash slip (form F4): notes × count, auto total, must equal the amount. Used by every cash
// receipt (ST-33 FD payment now; ST-45 counter receipts in M7).
import { CircleCheck, CircleX, Wand2 } from 'lucide-react';
import { ButtonV2, ButtonV2Size, ButtonV2Type } from '@juspay/blend-design-system';
import { DENOMINATIONS, denominationsFor, formatINR, type Denomination } from '@tgs/domain';
import type { Paise } from '@tgs/types';
import { cn } from '@/lib/utils';

export type Counts = Partial<Record<Denomination, number>>;

export function DenominationCounter({ amount, counts, onChange }: { amount: Paise; counts: Counts; onChange: (c: Counts) => void }) {
  const total = DENOMINATIONS.reduce((s, d) => s + d * 100 * (counts[d] ?? 0), 0);
  const ok = total === amount;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-card border border-line">
        <table className="w-full text-body">
          <thead className="bg-surface-subtle text-caption text-fg-tertiary">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Note</th>
              <th className="px-4 py-2 text-left font-medium">Count</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {DENOMINATIONS.map((d) => (
              <tr key={d}>
                <td className="tabular px-4 py-1.5 text-fg">₹{d}</td>
                <td className="px-4 py-1.5">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Number of ₹${d} notes`}
                    value={counts[d] ?? ''}
                    onChange={(e) => onChange({ ...counts, [d]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className="tabular h-9 w-24 rounded-control border border-line bg-surface px-2 text-body text-fg focus:outline-2 focus:outline-focus"
                  />
                </td>
                <td className="tabular px-4 py-1.5 text-right text-fg-secondary">{formatINR(d * 100 * (counts[d] ?? 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-surface-subtle">
            <tr>
              <td className="px-4 py-2 text-label text-fg" colSpan={2}>
                Total counted
              </td>
              <td className={cn('tabular px-4 py-2 text-right text-label', ok ? 'text-success-fg' : 'text-danger-fg')}>{formatINR(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn('inline-flex items-center gap-1.5 text-caption-strong', ok ? 'text-success-fg' : 'text-danger-fg')} aria-live="polite">
          {ok ? <CircleCheck size={16} aria-hidden /> : <CircleX size={16} aria-hidden />}
          {ok ? 'Notes match the amount (BR-029)' : `${total < amount ? 'Short' : 'Over'} by ${formatINR(Math.abs(amount - total))}`}
        </p>
        <ButtonV2 text="Fill fewest notes" buttonType={ButtonV2Type.SECONDARY} size={ButtonV2Size.SMALL} leftSlot={{ slot: <Wand2 size={14} /> }} onClick={() => onChange(denominationsFor(amount))} />
      </div>
    </div>
  );
}
