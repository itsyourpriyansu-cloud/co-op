import type { DeductionEntryAction, DemandSheetAction } from '@tgs/domain';
import type { DeductionEntryInput, NewReceiptInput, ReceiptListParams, RecoveryInput, ReportPaymentInput } from '@tgs/types';
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
  entry = (r: FastifyRequest<{ Params: { id: string; action: DeductionEntryAction }; Body: Partial<DeductionEntryInput> & { reason?: string } }>) => this.service.entryAction(r, r.params.id, r.params.action, r.body ?? {});

  receipts = (r: FastifyRequest<{ Querystring: ReceiptListParams }>) => this.service.receipts(sessionOf(r), r.query);
  receipt = (r: ById) => this.service.receipt(sessionOf(r), r.params.id);
  cancelReceipt = (r: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) => this.service.cancelReceipt(r, r.params.id, r.body?.reason);
  counterReceipt = (r: FastifyRequest<{ Body: Partial<NewReceiptInput> }>) => this.service.counterReceipt(r, r.body ?? {});
  dues = (r: ById) => this.service.memberDues(sessionOf(r), r.params.id);
  notices = (r: ById) => this.service.memberNotices(sessionOf(r), r.params.id);
  waivePenal = (r: FastifyRequest<{ Params: { id: string }; Body: { sheetId?: string; amount?: number; reason?: string } }>) => this.service.waivePenal(r, r.params.id, r.body ?? {});

  reports = (r: FastifyRequest<{ Querystring: { status?: string } }>) => this.service.reports(sessionOf(r), r.query.status);
  verify = (r: FastifyRequest<{ Params: { id: string }; Body: { remarks?: string } }>) => this.service.verifyReport(r, r.params.id, r.body?.remarks);
  reject = (r: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) => this.service.rejectReport(r, r.params.id, r.body?.reason);

  myPayments = (r: FastifyRequest) => this.service.myPayments(sessionOf(r));
  myReceipt = (r: ById) => this.service.myReceipt(sessionOf(r), r.params.id);
  reportPayment = (r: FastifyRequest<{ Body: Partial<ReportPaymentInput> }>) => this.service.reportPayment(r, r.body ?? {});
}
