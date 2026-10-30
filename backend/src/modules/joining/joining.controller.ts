import type { MembershipAction, MembershipActionInput, MembershipForm } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { JoiningService } from './joining.service';

type ById = FastifyRequest<{ Params: { id: string } }>;
type Eligibility = { worksInSecretariatDept: boolean; regularOrApprovedProbationer: boolean; memberOfOtherCreditSocietyWithDues: boolean };

export class JoiningController {
  constructor(private readonly service: JoiningService) {}

  reference = () => this.service.reference();
  me = (r: FastifyRequest) => this.service.me(sessionOf(r));
  eligibility = (r: FastifyRequest<{ Body: Eligibility }>) => this.service.eligibility(sessionOf(r), r.body);
  saveDraft = (r: FastifyRequest<{ Body: MembershipForm }>) => this.service.saveDraft(sessionOf(r), r.body);
  requestSign = (r: FastifyRequest) => this.service.requestSign(sessionOf(r));
  submit = (r: FastifyRequest<{ Body: { otpRef?: string; otp?: string } }>) => this.service.submit(r, r.body);

  list = (r: FastifyRequest) => this.service.list(sessionOf(r));
  detail = (r: ById) => this.service.detail(sessionOf(r), r.params.id);
  act = (r: FastifyRequest<{ Params: { id: string; action: MembershipAction }; Body: MembershipActionInput }>) => this.service.act(r, r.params.id, r.params.action, r.body ?? {});
  demoAct = (r: ById) => this.service.demoActFor(r, r.params.id);

  // Phone tracker demo controls (DEMO_MODE only): act for whoever owns the stage.
  demoAdvance = (r: ById) => this.service.demoAct(r, r.params.id);
  demoRequestInfo = (r: FastifyRequest<{ Params: { id: string }; Body: { field?: string; message?: string } }>) =>
    this.service.demoAct(r, r.params.id, 'returnToApplicant', { ...(r.body?.field ? { field: r.body.field } : {}), ...(r.body?.message ? { remarks: r.body.message } : {}) });
  demoReject = (r: ById) => this.service.demoAct(r, r.params.id, 'reject');
}
