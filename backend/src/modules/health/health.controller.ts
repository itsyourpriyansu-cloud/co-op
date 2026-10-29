import type { FastifyReply, FastifyRequest } from 'fastify';
import type { HealthService } from './health.service';

export class HealthController {
  constructor(private readonly service: HealthService) {}

  get = async (_request: FastifyRequest, reply: FastifyReply) => {
    const health = await this.service.check();
    return reply.status(health.ok ? 200 : 503).send(health);
  };
}
