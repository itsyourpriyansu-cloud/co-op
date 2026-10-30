import type { MemberInput, MemberListParams, TransferInput } from '@tgs/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { MembersService } from './members.service';

type Req<P = unknown, Q = unknown, B = unknown> = FastifyRequest<{ Params: P; Querystring: Q; Body: B }>;
type ListQuery = MemberListParams & { sort?: string; page?: number; pageSize?: number };

export class MembersController {
  constructor(private readonly service: MembersService) {}

  list = (r: Req<unknown, ListQuery>) => this.service.list(sessionOf(r), r.query);
  detail = (r: Req<{ id: string }>) => this.service.detail(sessionOf(r), r.params.id);
  create = async (r: Req<unknown, unknown, Partial<MemberInput>>, reply: FastifyReply) => reply.status(201).send(await this.service.create(r, r.body));
  update = (r: Req<{ id: string }, unknown, Partial<MemberInput>>) => this.service.update(r, r.params.id, r.body);
  transfer = (r: Req<{ id: string }, unknown, Partial<TransferInput>>) => this.service.transfer(r, r.params.id, r.body);
  agreeMandate = (r: Req<{ id: string }>) => this.service.agreeMandate(r, r.params.id);
}
