import type { OtpStarted, Session } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { fail } from '../../common/errors/app-error';
import { randomCode, randomToken, sameHash, sha256 } from '../../common/utils/crypto';
import { withTransaction } from '../../db/transaction';
import type { AuthRepository, OtpRow } from './auth.repository';
import { appSessionUser, maskMobile } from './session-user';
import type { TokensService } from './tokens.service';

const DEMO_OTP = '123456';
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const MAX_PER_WINDOW = 5;

/**
 * Member App sign-in and sign-up by mobile number + one-time code (D-067). Delivery is simulated
 * until P8 connects WhatsApp / push; in demo mode the code is always 123456 and is returned.
 */
export class OtpService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: AuthRepository,
    private readonly tokens: TokensService,
  ) {}

  async start(mobile: string, purpose: 'LOGIN' | 'SIGNUP'): Promise<OtpStarted> {
    const account = await this.repo.appByMobile(mobile);
    if (purpose === 'LOGIN') {
      if (!account) fail('VALIDATION_ERROR', 'This mobile is not registered with the society.', { fieldErrors: { mobile: 'Not registered. Use the mobile in your society record, or become a member.' } });
      if (account!.status !== 'ACTIVE') fail('FORBIDDEN', 'This account is not active. Contact the society office.');
    } else if (account) {
      fail('ALREADY_EXISTS', 'This mobile is already registered. Sign in instead.', { fieldErrors: { mobile: 'Already registered. Sign in instead.' } });
    }

    const recent = await this.repo.otpsSince(mobile, new Date(Date.now() - WINDOW_MINUTES * 60_000));
    if (recent >= MAX_PER_WINDOW) fail('RULE_VIOLATION', `Too many codes requested. Try again in ${WINDOW_MINUTES} minutes.`, { ruleId: 'OTP_RATE_LIMIT' });

    const demo = this.app.env.DEMO_MODE;
    const code = demo ? DEMO_OTP : randomCode();
    const row = await this.repo.insertOtp({
      mobile,
      purpose,
      codeHash: sha256(`${mobile}:${code}`),
      channel: 'SIMULATED',
      expiresAt: new Date(Date.now() + this.app.env.OTP_TTL_SECONDS * 1000),
    });
    // Simulated delivery (P8 sends it by WhatsApp / push). Never logged in production.
    if (this.app.env.NODE_ENV !== 'production') this.app.log.info({ mobile: maskMobile(mobile), code }, 'simulated OTP');
    return {
      otpRef: row.id,
      expiresInSeconds: this.app.env.OTP_TTL_SECONDS,
      channel: 'SIMULATED',
      mobileMasked: maskMobile(mobile),
      ...(demo ? { demoOtp: code } : {}),
    };
  }

  async verify(request: FastifyRequest, otpRef: string, otp: string, name?: string): Promise<Session> {
    const row = await this.repo.otpById(otpRef);
    this.assertUsable(row);
    if (!sameHash(row!.codeHash, sha256(`${row!.mobile}:${otp}`))) {
      await this.repo.bumpOtpAttempts(row!.id);
      fail('VALIDATION_ERROR', "That code doesn't match. Check the message and try again.", { fieldErrors: { otp: 'Incorrect code' } });
    }
    if (row!.purpose === 'SIGNUP' && !name?.trim()) {
      fail('VALIDATION_ERROR', 'Enter your full name.', { fieldErrors: { name: 'Enter your full name as in your service record.' } });
    }

    const account = await withTransaction(this.app.db, async (tx) => {
      if (!(await this.repo.consumeOtp(row!.id, tx))) fail('VALIDATION_ERROR', 'This code has already been used. Request a new one.', { fieldErrors: { otp: 'Already used' } });
      if (row!.purpose === 'LOGIN') {
        const existing = await this.repo.appByMobile(row!.mobile);
        if (!existing || existing.status !== 'ACTIVE') fail('FORBIDDEN', 'This account is not active. Contact the society office.');
        await this.repo.touchAppLogin(existing!.id, tx);
        return existing!;
      }
      const id = `apl-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const created = await this.repo.insertApp({ id, kind: 'APPLICANT', applicantId: id, name: name!.trim(), mobile: row!.mobile, lastLoginAt: new Date() }, tx);
      await this.app.audit.record(request, { action: 'auth.signup', entity: 'appAccount', entityId: id, summary: `${created.name} signed up to apply for membership`, actor: { id, name: created.name, role: 'APPLICANT' } }, tx);
      return created;
    });

    const user = appSessionUser(account);
    await this.app.audit.record(request, { action: 'auth.login', entity: 'appAccount', entityId: account.id, summary: `${account.name} signed in to the Member App`, actor: user });
    return this.tokens.issue(request, 'APP', user, account.id);
  }

  private assertUsable(row: OtpRow | undefined): void {
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      fail('VALIDATION_ERROR', 'This code has expired. Request a new one.', { fieldErrors: { otp: 'Expired' } });
    }
    if (row!.attempts >= MAX_ATTEMPTS) {
      fail('VALIDATION_ERROR', 'Too many wrong codes. Request a new one.', { fieldErrors: { otp: 'Too many tries' } });
    }
  }
}
