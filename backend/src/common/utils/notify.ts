import type { FastifyInstance } from 'fastify';

/** In-app notification by template (ST-63). TODO(P8): the backend sends them; until then the mock creates them. */
export async function notifyMember(app: FastifyInstance, recipientId: string, templateKey: string, vars: Record<string, string | number>, link?: string): Promise<void> {
  await app.mockBridge?.send(undefined, 'POST', '/api/v1/__demo/notify', { recipientId, templateKey, vars, ...(link ? { link } : {}) }).catch((err) => app.log.warn({ err }, 'mock notify failed'));
}
