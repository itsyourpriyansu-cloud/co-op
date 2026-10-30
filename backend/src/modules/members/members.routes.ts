import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../common/guards';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { memberDetailResponse, memberInput, memberListQuery, memberListResponse, memberParams, transferInput } from './members.schema';
import { MembersService } from './members.service';

/** ST-10…13 members (docs/22 §5.4 P4a). The service checks members.view / members.edit and the DDO's department. */
export const membersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new MembersController(new MembersService(app, new MembersRepository(app.db)));
  const tags = ['members'];
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };

  app.get('/members', { ...pre, schema: { tags, summary: 'Members with filters, counts and paging (DDO: own department)', security, querystring: memberListQuery, response: { 200: memberListResponse } } }, controller.list);
  // TODO(P5): member search for loans lives in the mock's loans module; its path sits under /members.
  app.get('/members/search', { ...pre, schema: { hide: true } }, async (request, reply) => {
    const bridge = app.mockBridge;
    if (!bridge) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Member search arrives with loans (P5).' });
    const res = await bridge.send(request.session, 'GET', request.url);
    return reply.status(res.status).header('content-type', 'application/json').send(await res.text());
  });
  app.get('/members/:id', { ...pre, schema: { tags, summary: 'A member by id or General No.', security, params: memberParams, response: { 200: memberDetailResponse } } }, controller.detail);
  app.post('/members', { ...pre, schema: { tags, summary: 'Add a member from the paper form (allots the next General No.)', security, body: memberInput, response: { 201: memberDetailResponse } } }, controller.create);
  app.put('/members/:id', { ...pre, schema: { tags, summary: 'Edit a member (not department or shares)', security, params: memberParams, body: memberInput, response: { 200: memberDetailResponse } } }, controller.update);
  app.post('/members/:id/transfers', { ...pre, schema: { tags, summary: 'Transfer to another department (BR-010, BR-028)', security, params: memberParams, body: transferInput, response: { 200: memberDetailResponse } } }, controller.transfer);
  app.post('/members/:id/mandate/agree', { ...pre, schema: { tags, summary: "The new DDO agrees the salary-recovery mandate", security, params: memberParams, response: { 200: memberDetailResponse } } }, controller.agreeMandate);
};
