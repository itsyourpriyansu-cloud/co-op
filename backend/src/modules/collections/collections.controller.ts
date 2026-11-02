import type { DemandSheetAction } from '@tgs/domain';
import type { NewReceiptInput, ReceiptListParams, RecoveryInput, ReportPaymentInput } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { CollectionsService } from './collections.service';

type ById = FastifyRequest<{ Params: { id: string } }>;

export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  overview = (r: FastifyRequest<{ Querystring: { cycle?: string } }>) => this.service.overview(sessionOf(r), r.query.cycle);
  preview = (r: FastifyRequest<{ Querystring: { cycle?: string; departmentIds?: string } }>) => this.service.preview(sessionOf(r), r.query.cycle, r.query.departmentIds);
  generate = (r: FastifyRequest<{ Body: { cycle?: string; departmentIds?: string[] } }>) => this.service.generate(r, r.body ?? {});
  sheet = (r: ById) => this.service.sheetDetail(sessionOf(r), r.params.id);
  act = (r: FastifyRequest<{ Params: { id: string; action: DemandSheetAction }; Body: RecoveryInput }>) => this.service.act(r, r.params.id, r.params.action, r.body);
  demoAct = (r: ById) => this.service.demoAct(r, r.params.id);

  receipts = (r: FastifyRequest<{ Querystring: ReceiptListParams }>) => this.service.receipts(sessionOf(r), r.query);
  receipt = (r: ById) => this.service.receipt(sessionOf(r), r.params.id);
  counterReceipt = (r: FastifyRequest<{ Body: Partial<NewReceiptInput> }>) => this.service.counterReceipt(r, r.body ?? {});
  dues = (r: ById) => this.service.memberDues(sessionOf(r), r.params.id);

  reports = (r: FastifyRequest<{ Querystring: { status?: string } }>) => this.service.reports(sessionOf(r), r.query.status);
  verify = (r: FastifyRequest<{ Params: { id: string }; Body: { remarks?: string } }>) => this.service.verifyReport(r, r.params.id, r.body?.remarks);
  reject = (r: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) => this.service.rejectReport(r, r.params.id, r.body?.reason);

  myPayments = (r: FastifyRequest) => this.service.myPayments(sessionOf(r));
  myReceipt = (r: ById) => this.service.myReceipt(sessionOf(r), r.params.id);
  reportPayment = (r: FastifyRequest<{ Body: Partial<ReportPaymentInput> }>) => this.service.reportPayment(r, r.body ?? {});
}
