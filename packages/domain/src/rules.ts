// Shared shapes for business-rule results (docs/09). UI shows `message`; tests assert `pass`.

export interface RuleCheck {
  ruleId: string;
  pass: boolean;
  message: string;
  /** Warnings inform but never block (e.g. BR-024 surety retiring). */
  severity: 'block' | 'warn';
}

export const pass = (ruleId: string, message: string, severity: RuleCheck['severity'] = 'block'): RuleCheck => ({
  ruleId,
  pass: true,
  message,
  severity,
});

export const fail = (ruleId: string, message: string, severity: RuleCheck['severity'] = 'block'): RuleCheck => ({
  ruleId,
  pass: false,
  message,
  severity,
});

/** Society amounts are rounded to whole rupees (docs/09 BR-004, BR-006). */
export function roundToRupee(paise: number): number {
  return Math.round(paise / 100) * 100;
}
