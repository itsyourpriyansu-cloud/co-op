import type { ComposeInput, MemberPreferences, SupportTicket } from '@tgs/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessionOf } from '../../common/guards';
import type { NotificationsService } from './notifications.service';

type ById = FastifyRequest<{ Params: { id: string } }>;

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  list = (r: FastifyRequest) => this.service.staffList(sessionOf(r));
  count = (r: FastifyRequest) => this.service.count(sessionOf(r));
  readAll = (r: FastifyRequest) => this.service.markRead(sessionOf(r));
  read = (r: ById) => this.service.markRead(sessionOf(r), r.params.id);
  messages = (r: FastifyRequest) => this.service.messages(sessionOf(r));
  preview = (r: FastifyRequest) => this.service.preview(sessionOf(r), r.body as ComposeInput);
  send = (r: FastifyRequest) => this.service.send(r, r.body as ComposeInput);
  tickets = (r: FastifyRequest) => this.service.staffTickets(sessionOf(r));
  reply = (r: ById) => this.service.reply(r, r.params.id, (r.body ?? {}) as { text?: string; close?: boolean });
  failed = (r: FastifyRequest) => this.service.failedDeliveries(sessionOf(r));
  retry = (r: ById) => this.service.retryDelivery(r, r.params.id);
  stream = (r: FastifyRequest, reply: FastifyReply) => this.service.stream(r, reply);
  whatsappVerify = (r: FastifyRequest, reply: FastifyReply) => reply.type('text/plain').send(this.service.whatsappVerify(r.query as Record<string, string>));
  whatsappStatus = (r: FastifyRequest) => this.service.whatsappStatus(r.body as string, r.headers['x-hub-signature-256'] as string | undefined);

  home = (r: FastifyRequest) => this.service.home(sessionOf(r));
  mine = (r: FastifyRequest) => this.service.myNotifications(sessionOf(r));
  myReadAll = (r: FastifyRequest) => this.service.myMarkRead(sessionOf(r));
  myRead = (r: ById) => this.service.myMarkRead(sessionOf(r), r.params.id);
  preferences = (r: FastifyRequest) => this.service.myPreferences(sessionOf(r));
  savePreferences = (r: FastifyRequest) => this.service.savePreferences(sessionOf(r), (r.body ?? {}) as Partial<MemberPreferences>);
  support = (r: FastifyRequest) => this.service.support(sessionOf(r));
  registerPush = (r: FastifyRequest) => this.service.registerPush(sessionOf(r), (r.body ?? {}) as { token?: string; platform?: string });
  removePush = (r: FastifyRequest) => this.service.removePush(sessionOf(r), (r.body ?? {}) as { token?: string });
  ask = (r: FastifyRequest) => this.service.ask(r, (r.body ?? {}) as { subject?: string; message?: string; category?: SupportTicket['category'] });
}
