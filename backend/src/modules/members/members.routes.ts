import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth } from '../../common/guards';
import { MembersController } from './members.controller';
import { memberDetailResponse, memberInput, memberListQuery, memberListResponse, memberParams, transferInput } from './members.schema';

/** ST-10…13 members (docs/22 §5.4 P4a). The service checks members.view / members.edit and the DDO's department. */
export const membersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new MembersController(app.members);
  const tags = ['members'];
  const security = [{ bearer: [] }];
  const pre = { preHandler: requireAuth };

  app.get('/members', { ...pre, schema: { tags, summary: 'Members with filters, counts and paging (DDO: own department)', security, querystring: memberListQuery, response: { 200: memberListResponse } } }, controller.list);
  app.get('/members/:id', { ...pre, schema: { tags, summary: 'A member by id or General No.', security, params: memberParams, response: { 200: memberDetailResponse } } }, controller.detail);
  app.post('/members', { ...pre, schema: { tags, summary: 'Add a member from the paper form (allots the next General No.)', security, body: memberInput, response: { 201: memberDetailResponse } } }, controller.create);
  app.put('/members/:id', { ...pre, schema: { tags, summary: 'Edit a member (not department or shares)', security, params: memberParams, body: memberInput, response: { 200: memberDetailResponse } } }, controller.update);
  app.post('/members/:id/transfers', { ...pre, schema: { tags, summary: 'Transfer to another department (BR-010, BR-028)', security, params: memberParams, body: transferInput, response: { 200: memberDetailResponse } } }, controller.transfer);
  app.post('/members/:id/mandate/agree', { ...pre, schema: { tags, summary: "The new DDO agrees the salary-recovery mandate", security, params: memberParams, response: { 200: memberDetailResponse } } }, controller.agreeMandate);
};
