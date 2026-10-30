import fp from 'fastify-plugin';
import { MastersRepository } from '../modules/masters/masters.repository';
import { MastersService } from '../modules/masters/masters.service';

declare module 'fastify' {
  interface FastifyInstance {
    /** Active settings and loan products for every module (P2; loans, deposits and demand read them). */
    masters: MastersService;
  }
}

/** Services other modules call (a service may call another module's service, docs/22 §2). */
export const servicesPlugin = fp(
  async (app) => {
    app.decorate('masters', new MastersService(app, new MastersRepository(app.db)));
  },
  { name: 'services', dependencies: ['db', 'auth'] },
);
