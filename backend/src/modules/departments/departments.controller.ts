import type { Department } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { DepartmentsService } from './departments.service';

type Req<B = unknown, P = unknown> = FastifyRequest<{ Body: B; Params: P }>;

export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  list = (r: FastifyRequest) => this.service.list(sessionOf(r));
  create = (r: Req<Partial<Department>>) => this.service.create(r, r.body);
  update = (r: Req<Partial<Department>, { id: string }>) => this.service.update(r, r.params.id, r.body);
}
