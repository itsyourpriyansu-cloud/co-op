import type { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { departmentInput } from './departments.schema';
import type { DepartmentsService } from './departments.service';

type In = z.infer<typeof departmentInput>;

type Req<B = unknown, P = unknown> = FastifyRequest<{ Body: B; Params: P }>;

export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  list = (r: FastifyRequest) => this.service.list(sessionOf(r));
  create = (r: Req<In>) => this.service.create(r, r.body);
  update = (r: Req<In, { id: string }>) => this.service.update(r, r.params.id, r.body);
}
