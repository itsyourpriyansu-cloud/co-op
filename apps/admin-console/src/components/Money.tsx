import { formatINR, formatINRCompact } from '@tgs/domain';
import type { Paise } from '@tgs/types';
import { cn } from '@/lib/utils';

/** All money in the console renders through this: Indian grouping, tabular digits, optional tone. */
export function Money({ value, compact, decimals, tone, className }: { value: Paise; compact?: boolean; decimals?: 0 | 2; tone?: 'credit' | 'debit'; className?: string }) {
  const text = compact ? formatINRCompact(value) : formatINR(value, { decimals: decimals ?? 0 });
  return <span className={cn('tabular', tone === 'credit' && 'text-credit', tone === 'debit' && 'text-debit', className)}>{text}</span>;
}
