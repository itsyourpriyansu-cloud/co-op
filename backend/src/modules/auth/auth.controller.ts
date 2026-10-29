import type { Channel } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { AuthService } from './auth.service';
import type { OtpService } from './otp.service';
import type { TokensService } from './tokens.service';

type Req<B = unknown, Q = unknown> = FastifyRequest<{ Body: B; Querystring: Q }>;

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
  ) {}

  staffLogin = (r: Req<{ username: string; password: string }>) => this.auth.staffLogin(r, r.body.username, r.body.password);
  totpSetup = (r: Req<{ challengeToken: string }>) => this.auth.totpSetup(r.body.challengeToken);
  totpConfirm = (r: Req<{ challengeToken: string; code: string }>) => this.auth.totpConfirm(r, r.body.challengeToken, r.body.code);
  totpVerify = (r: Req<{ challengeToken: string; code: string }>) => this.auth.totpVerify(r, r.body.challengeToken, r.body.code);

  otpStart = (r: Req<{ mobile: string; purpose: 'LOGIN' | 'SIGNUP' }>) => this.otp.start(r.body.mobile, r.body.purpose);
  otpVerify = (r: Req<{ otpRef: string; otp: string; name?: string }>) => this.otp.verify(r, r.body.otpRef, r.body.otp, r.body.name);

  refresh = (r: Req<{ refreshToken: string }>) => this.tokens.refresh(r, r.body.refreshToken);

  logout = async (r: Req<{ refreshToken?: string } | undefined>) => {
    await this.tokens.logout(r.body?.refreshToken, sessionOf(r).id);
    return { ok: true as const };
  };

  me = (r: FastifyRequest) => this.auth.me(sessionOf(r));

  personas = (r: Req<unknown, { channel?: Channel }>) => this.auth.listPersonas(r.query.channel);
  personaLogin = (r: Req<{ personaId: string; channel?: Channel }>) => this.auth.personaLogin(r, r.body.personaId, r.body.channel);
}
