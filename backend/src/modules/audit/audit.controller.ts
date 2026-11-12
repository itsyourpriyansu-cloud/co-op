import type { AuditLogParams } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import type { AuditService } from './audit.service';

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = (r: FastifyRequest<{ Querystring: AuditLogParams }>) => this.service.list(r.query);
  get = (r: FastifyRequest<{ Params: { id: string } }>) => this.service.get(r.params.id);
}
