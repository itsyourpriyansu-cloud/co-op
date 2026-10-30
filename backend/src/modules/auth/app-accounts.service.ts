import type { OtpChallenge } from '@tgs/types';
import type { FastifyInstance } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { randomCode, sameHash, sha256 } from '../../common/utils/crypto';
import { withTransaction, type Tx } from '../../db/transaction';
import type { AuthRepository } from './auth.repository';

const DEMO_OTP = '123456';
type CodePurpose = 'MOBILE_CHANGE' | 'SIGN';

/** Keeps Member App sign-in (mobile + OTP, D-067) in step with the member master (P4). */
export class AppAccountsService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: AuthRepository,
  ) {}

  /** A mobile already used by someone else's sign-in, e.g. an applicant. */
  async assertMobileFree(mobile: string, memberId?: string): Promise<void> {
    const other = await this.repo.appByMobile(mobile);
    if (other && other.id !== memberId && other.memberId !== memberId) {
      fail('VALIDATION_ERROR', 'Please check the highlighted fields.', { fieldErrors: { mobile: 'This mobile is already used to sign in by someone else' } });
    }
  }

  /** A new member from joining: the applicant's sign-in becomes theirs, or a new one is made. */
  async memberJoined(tx: Tx, m: { id: string; generalNo: string; employeeId: string; name: string; mobile: string; active: boolean }): Promise<void> {
    if (await this.repo.convertApplicant(tx, m.mobile, m)) return;
    await this.repo.upsertMemberAccount(tx, m);
  }

  async upsertMember(tx: Tx, m: { id: string; generalNo: string; employeeId: string; name: string; mobile: string; active: boolean }): Promise<void> {
    await this.repo.upsertMemberAccount(tx, m);
  }

  /** The mobile an applicant signed up with (already proven by a code). */
  async mobileOf(accountId: string): Promise<string | undefined> {
    return (await this.repo.appById(accountId))?.mobile;
  }

  // ---- MB-19: a member moves their sign-in to a new mobile, proven by a code sent to it ----
  async startMobileChange(memberId: string, mobile: string): Promise<OtpChallenge> {
    await this.assertMobileFree(mobile, memberId);
    return this.startCode(mobile, 'MOBILE_CHANGE', memberId);
  }

  /** The verified new mobile. */
  async verifyMobileChange(memberId: string, otpRef: string, otp: string): Promise<string> {
    return this.verifyCode('MOBILE_CHANGE', memberId, otpRef, otp);
  }

  // ---- a code bound to one thing (a member's new mobile, an application to sign, D-031) ----
  async startCode(mobile: string, purpose: CodePurpose, subjectId: string): Promise<OtpChallenge> {
    const code = this.app.env.DEMO_MODE ? DEMO_OTP : randomCode();
    const row = await this.repo.insertOtp({ mobile, purpose, subjectId, codeHash: sha256(`${mobile}:${code}`), channel: 'SIMULATED', expiresAt: new Date(Date.now() + this.app.env.OTP_TTL_SECONDS * 1000) });
    if (this.app.env.NODE_ENV !== 'production') this.app.log.info({ code, purpose }, 'simulated OTP');
    return { otpRef: row.id, expiresInSeconds: this.app.env.OTP_TTL_SECONDS, ...(this.app.env.DEMO_MODE ? { demoOtp: code } : {}) };
  }

  /** Consumes the code; returns the mobile it was sent to. */
  async verifyCode(purpose: CodePurpose, subjectId: string, otpRef: string, otp: string): Promise<string> {
    const row = await this.repo.otpById(otpRef);
    if (!row || row.purpose !== purpose || row.subjectId !== subjectId || row.consumedAt || row.expiresAt < new Date()) {
      fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    }
    if (row!.attempts >= 5) fail('VALIDATION_ERROR', 'Too many wrong codes. Request a new one.', { fieldErrors: { otp: 'Too many tries' } });
    if (!sameHash(row!.codeHash, sha256(`${row!.mobile}:${otp}`))) {
      await this.repo.bumpOtpAttempts(row!.id);
      fail('VALIDATION_ERROR', "That code doesn't match. Check the message and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    }
    await withTransaction(this.app.db, async (tx) => {
      if (!(await this.repo.consumeOtp(row!.id, tx))) fail('VALIDATION_ERROR', 'This code has already been used.', { fieldErrors: { otp: 'Already used' } });
    });
    return row!.mobile;
  }
}
