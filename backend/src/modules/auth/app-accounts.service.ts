import type { Tx } from '../../db/transaction';
import { fail } from '../../common/errors/app-error';
import type { AuthRepository } from './auth.repository';

/** Keeps Member App sign-in (mobile + OTP, D-067) in step with the member master (P4). */
export class AppAccountsService {
  constructor(private readonly repo: AuthRepository) {}

  /** A mobile already used by someone else's sign-in, e.g. an applicant. */
  async assertMobileFree(mobile: string, memberId?: string): Promise<void> {
    const other = await this.repo.appByMobile(mobile);
    if (other && other.id !== memberId) fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: { mobile: 'This mobile is already used to sign in by someone else' } });
  }

  /** A new member from joining: the applicant's sign-in becomes theirs, or a new one is made. */
  async memberJoined(tx: Tx, m: { id: string; generalNo: string; employeeId: string; name: string; mobile: string; active: boolean }): Promise<void> {
    if (await this.repo.convertApplicant(tx, m.mobile, m)) return;
    await this.repo.upsertMemberAccount(tx, m);
  }

  async upsertMember(tx: Tx, m: { id: string; generalNo: string; employeeId: string; name: string; mobile: string; active: boolean }): Promise<void> {
    await this.repo.upsertMemberAccount(tx, m);
  }
}
