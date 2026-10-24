import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { RuleCheck } from '@tgs/domain';

/** EligibilityPanel building block (docs/18 §7): explains every rule outcome, never just "invalid". */
export function RuleCheckList({ checks }: { checks: RuleCheck[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {checks.map((c, i) => {
        const Icon = c.pass ? CircleCheck : c.severity === 'warn' ? TriangleAlert : CircleX;
        const tone = c.pass ? 'text-success-fg' : c.severity === 'warn' ? 'text-warning-fg' : 'text-danger-fg';
        return (
          <li key={`${c.ruleId}-${i}`} className="flex items-start gap-2">
            <Icon size={18} className={`mt-px shrink-0 ${tone}`} aria-hidden />
            <span className="text-body text-fg">
              {c.message} <span className="text-caption text-fg-tertiary">({c.ruleId})</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
