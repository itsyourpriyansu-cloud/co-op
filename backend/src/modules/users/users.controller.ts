import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { staffUserInput } from './users.schema';
import type { UsersService } from './users.service';

type Input = z.infer<typeof staffUserInput>;
type WithId<B = unknown> = FastifyRequest<{ Params: { id: string }; Body: B }>;

export class UsersController {
  constructor(private readonly service: UsersService) {}

  list = () => this.service.list();
  create = (r: FastifyRequest<{ Body: Input }>) => this.service.create(r, r.body);
  update = (r: WithId<Input>) => this.service.update(r, r.params.id, r.body);
  resetPassword = (r: WithId) => this.service.resetPassword(r, r.params.id);
  resetTotp = (r: WithId) => this.service.resetTotp(r, r.params.id);
  changeOwnPassword = (r: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>) =>
    this.service.changeOwnPassword(r, r.body.currentPassword, r.body.newPassword);
}
