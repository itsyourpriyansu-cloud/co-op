import type { JournalLineInput } from '@tgs/domain';
import type { FastifyRequest } from 'fastify';
import type { LedgerService } from './ledger.service';

type Range = { from?: string; to?: string; limit: number };
type Req<P = unknown, Q = unknown, B = unknown> = FastifyRequest<{ Params: P; Querystring: Q; Body: B }>;

export class LedgerController {
  constructor(private readonly service: LedgerService) {}

  accounts = () => this.service.accounts();
  trialBalance = (r: Req<unknown, { asOf?: string }>) => this.service.trialBalance(r.query.asOf);
  accountLedger = (r: Req<{ code: string }, Range>) => this.service.accountLedger(r.params.code, r.query, r.query.limit);
  memberStatement = (r: Req<{ memberId: string }, Range>) => this.service.memberStatement(r.params.memberId, r.query, r.query.limit);
  journals = (r: Req<unknown, { page: number; pageSize: number; from?: string; to?: string; source?: string }>) => this.service.journals(r.query, r.query.page, r.query.pageSize);
  journal = (r: Req<{ id: string }>) => this.service.journal(r.params.id);
  postManual = (r: Req<unknown, unknown, { entryDate?: string; narration: string; lines: JournalLineInput[] }>) => this.service.postManual(r, r.body);
  reverse = (r: Req<{ id: string }, unknown, { reason: string }>) => this.service.reverse(r, r.params.id, r.body.reason);
}
