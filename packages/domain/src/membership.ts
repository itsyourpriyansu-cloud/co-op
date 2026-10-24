// BR-026 (form F1): membership eligibility.
import type { ISODate } from '@tgs/types';
import { ageOn } from './members';
import { fail, pass, type RuleCheck } from './rules';

export interface EligibilityAnswers {
  worksInSecretariatDept: boolean;
  regularOrApprovedProbationer: boolean;
  memberOfOtherCreditSocietyWithDues: boolean;
  dob?: ISODate;
  today?: ISODate;
}

export function checkMembershipEligibility(a: EligibilityAnswers): { eligible: boolean; checks: RuleCheck[] } {
  const checks: RuleCheck[] = [
    a.worksInSecretariatDept
      ? pass('BR-026', 'Employed in a Telangana Secretariat department.')
      : fail('BR-026', 'Membership is open to employees of Telangana Secretariat departments.'),
    a.regularOrApprovedProbationer
      ? pass('BR-026', 'Regular appointment or approved probationer.')
      : fail('BR-026', 'You need a regular appointment or approved probation.'),
    !a.memberOfOtherCreditSocietyWithDues
      ? pass('BR-026', 'Not a member of another co-operative credit society with dues.')
      : fail('BR-026', 'Please clear dues and leave the other credit society before applying.'),
  ];
  if (a.dob && a.today) {
    checks.push(ageOn(a.dob, a.today) >= 18 ? pass('BR-026', 'Age 18 or above.') : fail('BR-026', 'Applicants must be 18 or older.'));
  }
  return { eligible: checks.every((c) => c.pass), checks };
}
