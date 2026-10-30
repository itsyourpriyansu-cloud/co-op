import type { LoanAction } from '@tgs/domain';
import type { LoanActionInput, LoanRequestInput } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { LoanWorkflowService } from './loan-workflow.service';
import type { LoansService } from './loans.service';

type ById = FastifyRequest<{ Params: { id: string } }>;
type Otp = { otpRef?: string; otp?: string };
type ListQuery = { q?: string; product?: string; group?: string; departmentId?: string; page?: number; pageSize?: number };

export class LoansController {
  constructor(
    private readonly loans: LoansService,
    private readonly flow: LoanWorkflowService,
  ) {}

  // staff
  list = (r: FastifyRequest<{ Querystring: ListQuery }>) => this.loans.list(sessionOf(r), r.query);
  get = (r: ById) => this.loans.getForStaff(sessionOf(r), r.params.id);
  memberContext = (r: ById) => this.loans.contextForStaff(sessionOf(r), r.params.id);
  createCounter = (r: FastifyRequest<{ Body: Partial<LoanRequestInput> & { memberId?: string; submit?: boolean } }>) => this.loans.createCounter(r, r.body ?? {});
  sanctionPreview = (r: FastifyRequest<{ Params: { id: string }; Querystring: { amount?: number; instalments?: number } }>) => this.flow.preview(sessionOf(r), r.params.id, r.query.amount, r.query.instalments);
  act = (r: FastifyRequest<{ Params: { id: string; action: LoanAction }; Body: LoanActionInput }>) => this.flow.act(r, r.params.id, r.params.action, r.body ?? {});
  demoAct = (r: ById) => this.flow.demoAct(r, r.params.id);

  // shared
  search = (r: FastifyRequest<{ Querystring: { q?: string } }>) => this.loans.search(sessionOf(r), r.query.q ?? '');
  assess = (r: FastifyRequest<{ Body: Partial<LoanRequestInput> & { memberId?: string; loanId?: string } }>) => this.loans.assessForm(sessionOf(r), r.body ?? {});
  suretyPreview = (r: FastifyRequest<{ Body: { borrowerId?: string; sureties?: string[]; instalments?: number } }>) => this.loans.suretyPreview(sessionOf(r), r.body ?? {});

  // member
  mine = (r: FastifyRequest) => this.loans.mine(sessionOf(r));
  myContext = (r: FastifyRequest) => this.loans.myContext(sessionOf(r));
  myDetail = (r: ById) => this.loans.myDetail(sessionOf(r), r.params.id);
  createMine = (r: FastifyRequest<{ Body: Partial<LoanRequestInput> }>) => this.loans.createMine(r, r.body ?? {});
  updateMine = (r: FastifyRequest<{ Params: { id: string }; Body: Partial<LoanRequestInput> }>) => this.loans.updateMine(sessionOf(r), r.params.id, r.body ?? {});
  discardMine = (r: ById) => this.loans.discardMine(sessionOf(r), r.params.id);
  requestSign = (r: ById) => this.loans.requestSign(sessionOf(r), r.params.id);
  submitMine = (r: FastifyRequest<{ Params: { id: string }; Body: Otp }>) => this.loans.submitMine(r, r.params.id, r.body ?? {});
  replaceSurety = (r: FastifyRequest<{ Params: { id: string }; Body: { oldId?: string; newId?: string } }>) => this.flow.replaceSurety(r, r.params.id, r.body ?? {});
  withdraw = (r: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) => this.flow.withdraw(r, r.params.id, r.body?.reason);

  // surety
  suretyRequests = (r: FastifyRequest) => this.flow.suretyRequests(sessionOf(r));
  suretySign = (r: FastifyRequest<{ Params: { loanId: string } }>) => this.flow.suretySignRequest(sessionOf(r), r.params.loanId);
  suretyAccept = (r: FastifyRequest<{ Params: { loanId: string }; Body: Otp }>) => this.flow.suretyAccept(r, r.params.loanId, r.body ?? {});
  suretyDecline = (r: FastifyRequest<{ Params: { loanId: string }; Body: { reason?: string } }>) => this.flow.suretyDecline(r, r.params.loanId, r.body?.reason);
}
