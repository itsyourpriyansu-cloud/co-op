import type { DepositAction } from '@tgs/domain';
import type { DepositActionInput, FdRequestInput } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { DepositsService } from './deposits.service';

type ById = FastifyRequest<{ Params: { id: string } }>;
type ListQuery = { tab?: string; status?: string; maturingWithinDays?: number; departmentId?: string; q?: string; page?: number; pageSize?: number };

export class DepositsController {
  constructor(private readonly service: DepositsService) {}

  list = (r: FastifyRequest<{ Querystring: ListQuery }>) => this.service.list(sessionOf(r), r.query);
  get = (r: ById) => this.service.get(sessionOf(r), r.params.id);
  open = (r: FastifyRequest<{ Body: Partial<FdRequestInput> & { memberId?: string } }>) => this.service.open(r, r.body ?? {});
  act = (r: FastifyRequest<{ Params: { id: string; action: DepositAction }; Body: DepositActionInput }>) => this.service.act(r, r.params.id, r.params.action, r.body ?? {});
  demoAct = (r: ById) => this.service.demoAct(r, r.params.id);

  mine = (r: FastifyRequest) => this.service.mine(sessionOf(r));
  context = (r: FastifyRequest) => this.service.context(sessionOf(r));
  myDetail = (r: ById) => this.service.myDetail(sessionOf(r), r.params.id);
  requestSign = (r: FastifyRequest<{ Body: Partial<FdRequestInput> }>) => this.service.requestSign(sessionOf(r), r.body ?? {});
  createMine = (r: FastifyRequest<{ Body: { otpRef?: string; otp?: string } }>) => this.service.createMine(r, r.body ?? {});
  cancelMine = (r: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) => this.service.cancelMine(r, r.params.id, r.body?.reason);
}
