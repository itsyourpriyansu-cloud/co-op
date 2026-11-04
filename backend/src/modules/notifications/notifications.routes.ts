import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../common/guards';
import { NotificationsController } from './notifications.controller';

const passthrough = (name: string) => z.any().describe(`${name} (packages/types)`);
const ok = (name: string) => ({ 200: passthrough(name) });
const idParams = z.object({ id: z.string().min(1) });
const anyBody = z.record(z.string(), z.unknown()).nullish();

/** ST-03 notifications, composer and member questions; MB-01 / MB-12 / MB-13 / MB-14 (docs/22 §5.7 P8a). */
export const notificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = new NotificationsController(app.notifications);
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };
  const st = ['notifications'];
  const me = ['member app'];

  app.get('/notifications', { ...pre, schema: { tags: st, summary: 'My notifications (staff)', security, response: ok('StaffNotifications') } }, c.list);
  app.get('/notifications/count', { ...pre, schema: { tags: st, summary: 'Unread notifications and open member questions, for the bell', security, response: ok('{ unread, openQuestions }') } }, c.count);
  app.post('/notifications/read-all', { ...pre, schema: { tags: st, summary: 'Mark all read', security, body: anyBody, response: ok('{ ok }') } }, c.readAll);
  app.post('/notifications/:id/read', { ...pre, schema: { tags: st, summary: 'Mark one read', security, params: idParams, body: anyBody, response: ok('{ ok }') } }, c.read);
  app.get('/messages', { ...pre, schema: { tags: st, summary: 'Messages sent from the composer', security, response: ok('OutboxMessage[]') } }, c.messages);
  app.post('/messages/preview', { ...pre, schema: { tags: st, summary: 'Who would receive a message, with three filled samples', security, body: anyBody, response: ok('ComposePreview') } }, c.preview);
  app.post('/messages', { ...pre, schema: { tags: st, summary: 'Send a message: in the app and on the chosen channel (simulated until F-10)', security, body: anyBody, response: { 201: passthrough('OutboxMessage') } } }, async (r, reply) => reply.code(201).send(await c.send(r)));
  app.get('/support/tickets', { ...pre, schema: { tags: st, summary: 'Member questions, open first', security, response: ok('StaffTicketRow[]') } }, c.tickets);
  app.post('/support/tickets/:id/reply', { ...pre, schema: { tags: st, summary: 'Reply to (or close) a member question', security, params: idParams, body: anyBody, response: ok('SupportTicket') } }, c.reply);

  app.get('/me/home', { ...pre, schema: { tags: me, summary: 'Home screen: shares, deposits, loans, this month and what needs doing', security, response: ok('MemberHome') } }, c.home);
  app.get('/me/notifications', { ...pre, schema: { tags: me, summary: 'My notifications, with the channels each also went out on', security, response: ok('MyNotifications') } }, c.mine);
  app.post('/me/notifications/read-all', { ...pre, schema: { tags: me, summary: 'Mark all read', security, body: anyBody, response: ok('{ ok }') } }, c.myReadAll);
  app.post('/me/notifications/:id/read', { ...pre, schema: { tags: me, summary: 'Mark one read', security, params: idParams, body: anyBody, response: ok('{ ok }') } }, c.myRead);
  app.get('/me/preferences', { ...pre, schema: { tags: me, summary: 'Channels I receive messages on', security, response: ok('MemberPreferences') } }, c.preferences);
  app.put('/me/preferences', { ...pre, schema: { tags: me, summary: 'Change my channels', security, body: anyBody, response: ok('MemberPreferences') } }, c.savePreferences);
  app.get('/me/support', { ...pre, schema: { tags: me, summary: 'Office contact, FAQs and my questions', security, response: ok('SupportCenter') } }, c.support);
  app.post('/me/support/tickets', { ...pre, schema: { tags: me, summary: 'Ask the society office a question', security, body: anyBody, response: { 201: passthrough('SupportTicket') } } }, async (r, reply) => reply.code(201).send(await c.ask(r)));
};
