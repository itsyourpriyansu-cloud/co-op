import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requirePermission, requireRole } from '../../common/guards';
import { DepartmentsController } from './departments.controller';
import { DepartmentsRepository } from './departments.repository';
import { departmentInput, departmentListSchema, departmentParams } from './departments.schema';
import { DepartmentsService } from './departments.service';

/** ST-67 departments & DDOs. Every staff role may read them (forms, filters); the Super Admin edits. */
export const departmentsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new DepartmentsController(new DepartmentsService(app, new DepartmentsRepository(app.db)));
  const tags = ['departments'];
  const security = [{ bearer: [] }];
  const staff = requireRole('SUPER_ADMIN', 'ACCOUNTANT', 'SECRETARY', 'PRESIDENT', 'CASHIER', 'DDO');
  const edit = requirePermission('settings.edit', 'Only the Super Admin can change settings.');

  app.get('/departments', { preHandler: staff, schema: { tags, summary: 'Departments with member counts and DDO logins', security, response: { 200: departmentListSchema } } }, controller.list);
  app.post('/departments', { preHandler: edit, schema: { tags, summary: 'Add a department', security, body: departmentInput, response: { 200: departmentListSchema } } }, controller.create);
  app.put('/departments/:id', { preHandler: edit, schema: { tags, summary: 'Edit a department', security, params: departmentParams, body: departmentInput, response: { 200: departmentListSchema } } }, controller.update);
};
