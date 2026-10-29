import { personas } from '@tgs/mock-data';
import { channelForRole, type Channel, type Me, type Session, type SessionUser, type StaffLoginResult, type TotpSetup } from '@tgs/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import { fail } from '../../common/errors/app-error';
import { decrypt, encrypt } from '../../common/utils/crypto';
import { dummyHash, verifyPassword } from '../../common/utils/password';
import type { AuthRepository, StaffRow } from './auth.repository';
import { appSessionUser, staffSessionUser } from './session-user';
import type { TokensService } from './tokens.service';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_TTL_SECONDS = 300;
const TOTP_ISSUER = 'TGSECCSL';

interface ChallengeClaims {
  typ: 'totp-challenge';
  sub: string;
}

/** Staff sign-in with password + authenticator (TOTP), demo sign-in, and /me (docs/22 §5.1). */
export class AuthService {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repo: AuthRepository,
    private readonly tokens: TokensService,
  ) {}

  // ---- staff: password ----------------------------------------------------------------------------
  async staffLogin(request: FastifyRequest, username: string, password: string): Promise<StaffLoginResult> {
    const staff = await this.repo.staffByUsername(username);
    if (!staff) {
      await verifyPassword(await dummyHash(), password); // same time as a real check
      await this.app.audit.record(request, { action: 'auth.loginFailed', entity: 'staffUser', summary: `Sign-in failed for unknown user ID "${username.slice(0, 40)}"`, actor: { id: 'anonymous', name: 'Unknown' } });
      return this.wrongCredentials();
    }
    this.assertCanSignIn(staff);
    if (!(await verifyPassword(staff.passwordHash, password))) {
      await this.recordFailure(request, staff, 'Wrong password');
      return this.wrongCredentials();
    }
    await this.repo.updateStaff(staff.id, { failedAttempts: 0, lockedUntil: null });

    if (this.app.env.TOTP_ROLES.includes(staff.role)) {
      const challengeToken = this.challenge(staff.id);
      const mustChangePassword = staff.mustChangePassword;
      return staff.totpEnabled ? { status: 'TOTP_REQUIRED', challengeToken, mustChangePassword } : { status: 'TOTP_SETUP_REQUIRED', challengeToken, mustChangePassword };
    }
    return { status: 'OK', session: await this.completeStaffLogin(request, staff), mustChangePassword: staff.mustChangePassword };
  }

  // ---- staff: authenticator ----------------------------------------------------------------------
  async totpSetup(challengeToken: string): Promise<TotpSetup> {
    const staff = await this.staffFromChallenge(challengeToken);
    if (staff.totpEnabled) fail('INVALID_TRANSITION', 'An authenticator is already set up. Enter its code instead.');
    const secret = generateSecret();
    await this.repo.updateStaff(staff.id, { totpSecret: encrypt(secret, this.app.env.DATA_ENCRYPTION_KEY) });
    const otpauthUrl = generateURI({ issuer: TOTP_ISSUER, label: staff.username, secret });
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }), secret };
  }

  async totpConfirm(request: FastifyRequest, challengeToken: string, code: string): Promise<Session> {
    const staff = await this.staffFromChallenge(challengeToken);
    if (staff.totpEnabled) fail('INVALID_TRANSITION', 'An authenticator is already set up. Enter its code instead.');
    if (!staff.totpSecret) fail('INVALID_TRANSITION', 'Start the authenticator set-up first.');
    await this.checkTotp(request, staff, code);
    await this.repo.updateStaff(staff.id, { totpEnabled: true });
    await this.app.audit.record(request, { action: 'auth.totpEnabled', entity: 'staffUser', entityId: staff.id, summary: `${staff.name} set up an authenticator app`, actor: staffSessionUser(staff) });
    return this.completeStaffLogin(request, staff);
  }

  async totpVerify(request: FastifyRequest, challengeToken: string, code: string): Promise<Session> {
    const staff = await this.staffFromChallenge(challengeToken);
    if (!staff.totpEnabled || !staff.totpSecret) fail('INVALID_TRANSITION', 'Set up an authenticator first.');
    await this.checkTotp(request, staff, code);
    return this.completeStaffLogin(request, staff);
  }

  // ---- demo sign-in (DEMO_MODE only) ------------------------------------------------------------
  listPersonas(channel?: Channel) {
    this.assertDemo();
    return personas.filter((p) => !channel || p.channel === channel);
  }

  async personaLogin(request: FastifyRequest, personaId: string, channel?: Channel): Promise<Session> {
    this.assertDemo();
    const persona = personas.find((p) => p.id === personaId) ?? fail('NOT_FOUND', 'Unknown demo persona.');
    // D-033: staff use only the Admin Console, members/applicants only the app.
    if (channel && channel !== persona.channel) {
      fail('FORBIDDEN', persona.channel === 'console' ? 'Staff sign in on the Admin Console.' : 'Members sign in on the Member App.');
    }
    if (persona.channel === 'console') {
      const staff = (await this.repo.staffById(persona.id)) ?? fail('NOT_FOUND', 'Unknown demo persona.');
      this.assertCanSignIn(staff);
      return this.completeStaffLogin(request, staff, 'demo');
    }
    const account = (await this.repo.appById(persona.id)) ?? fail('NOT_FOUND', 'Unknown demo persona.');
    if (account.status !== 'ACTIVE') fail('FORBIDDEN', 'This account is not active. Contact the society office.');
    await this.repo.touchAppLogin(account.id);
    return this.tokens.issue(request, 'APP', appSessionUser(account));
  }

  // ---- everyone ----------------------------------------------------------------------------------
  async me(user: SessionUser): Promise<Me> {
    return { user, channel: channelForRole(user.role), permissions: await this.app.permissions.forRole(user.role) };
  }

  // ---- helpers -----------------------------------------------------------------------------------
  private assertDemo(): void {
    if (!this.app.env.DEMO_MODE) fail('NOT_FOUND', 'Demo sign-in is not available on this server.');
  }

  private assertCanSignIn(staff: StaffRow): void {
    if (staff.status !== 'ACTIVE') fail('FORBIDDEN', 'This user has been deactivated. Ask the Super Admin.');
    if (staff.lockedUntil && staff.lockedUntil > new Date()) {
      const until = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(staff.lockedUntil);
      fail('FORBIDDEN', `Too many wrong attempts. Try again after ${until}.`, { ruleId: 'ACCOUNT_LOCKED' });
    }
  }

  private wrongCredentials(): never {
    fail('VALIDATION_ERROR', 'The user ID or password is not right.', { fieldErrors: { password: 'Check the user ID and password.' } });
  }

  private async recordFailure(request: FastifyRequest, staff: StaffRow, reason: string): Promise<void> {
    const failures = staff.failedAttempts + 1;
    const locked = failures >= MAX_FAILURES;
    await this.repo.updateStaff(staff.id, locked ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedAttempts: failures });
    await this.app.audit.record(request, {
      action: locked ? 'auth.locked' : 'auth.loginFailed',
      entity: 'staffUser',
      entityId: staff.id,
      summary: locked ? `${staff.name} locked for ${LOCK_MINUTES} minutes after ${MAX_FAILURES} failed attempts` : `${reason} for ${staff.name}`,
      actor: staffSessionUser(staff),
    });
  }

  private challenge(staffId: string): string {
    const claims: ChallengeClaims = { typ: 'totp-challenge', sub: staffId };
    return this.app.jwt.sign(claims, { expiresIn: CHALLENGE_TTL_SECONDS });
  }

  private async staffFromChallenge(token: string): Promise<StaffRow> {
    let claims: ChallengeClaims;
    try {
      claims = this.app.jwt.verify<ChallengeClaims>(token);
    } catch {
      return fail('UNAUTHENTICATED', 'This step has expired. Sign in again.');
    }
    if (claims.typ !== 'totp-challenge') fail('UNAUTHENTICATED', 'This step has expired. Sign in again.');
    const staff = (await this.repo.staffById(claims.sub)) ?? fail('UNAUTHENTICATED', 'Sign in again.');
    this.assertCanSignIn(staff);
    return staff;
  }

  private async checkTotp(request: FastifyRequest, staff: StaffRow, code: string): Promise<void> {
    const secret = decrypt(staff.totpSecret!, this.app.env.DATA_ENCRYPTION_KEY);
    // ±30 s tolerance for phone clocks that drift.
    const { valid } = await verifyTotp({ secret, token: code, epochTolerance: 30 });
    if (!valid) {
      await this.recordFailure(request, staff, 'Wrong authenticator code');
      fail('VALIDATION_ERROR', "That code doesn't match. Check the authenticator app and try again.", { fieldErrors: { code: 'Incorrect code' } });
    }
  }

  private async completeStaffLogin(request: FastifyRequest, staff: StaffRow, how: 'password' | 'demo' = 'password'): Promise<Session> {
    await this.repo.updateStaff(staff.id, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
    const user = staffSessionUser(staff);
    await this.app.audit.record(request, { action: how === 'demo' ? 'auth.demoLogin' : 'auth.login', entity: 'staffUser', entityId: staff.id, summary: `${staff.name} signed in${how === 'demo' ? ' (demo)' : ''}`, actor: user });
    return this.tokens.issue(request, 'STAFF', user);
  }
}
