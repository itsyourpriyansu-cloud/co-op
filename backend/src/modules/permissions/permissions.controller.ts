import type { ConsoleRole, Permission } from '@tgs/types';
import type { FastifyRequest } from 'fastify';
import type { PermissionsService } from './permissions.service';

export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  matrix = async () => this.service.matrix();

  update = async (request: FastifyRequest<{ Params: { role: ConsoleRole }; Body: { permissions: string[] } }>) =>
    this.service.updateRole(request, request.params.role, request.body.permissions as Permission[]);
}
