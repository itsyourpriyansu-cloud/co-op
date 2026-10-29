import fp from 'fastify-plugin';
import type { Database, DbHandle } from '../db/client';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    dbHandle: DbHandle;
  }
}

/** Makes the Drizzle database available as `app.db` and closes the pool on shutdown. */
export const dbPlugin = fp<{ handle: DbHandle }>(
  async (app, { handle }) => {
    app.decorate('db', handle.db);
    app.decorate('dbHandle', handle);
    app.addHook('onClose', async () => {
      await handle.close();
    });
  },
  { name: 'db' },
);
