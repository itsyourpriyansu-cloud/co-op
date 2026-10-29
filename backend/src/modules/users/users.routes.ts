import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth, requirePermission, requireRole } from '../../common/guards';
import { okSchema } from '../auth/auth.schema';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { changePasswordBody, staffUserInput, staffUserListSchema, temporaryPasswordSchema, userIdParam } from './users.schema';
import { UsersService } from './users.service';

/** ST-61 staff users (docs/03: only the Super Admin manages them; staff view the list). */
export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new UsersController(new UsersService(app, new UsersRepository(app.db)));
  const tags = ['users & permissions'];
  const security = [{ bearer: [] }];
  const manage = requirePermission('users.manage', 'Only the Super Admin can manage users.');

  app.get('/users', { preHandler: requirePermission('settings.view'), schema: { tags, summary: 'Staff users', security, response: { 200: staffUserListSchema } } }, controller.list);
  app.post('/users', { preHandler: manage, schema: { tags, summary: 'Add a staff user', security, body: staffUserInput, response: { 200: staffUserListSchema } } }, controller.create);
  app.put('/users/:id', { preHandler: manage, schema: { tags, summary: 'Edit or deactivate a staff user', security, params: userIdParam, body: staffUserInput, response: { 200: staffUserListSchema } } }, controller.update);
  app.post('/users/:id/reset-password', { preHandler: manage, schema: { tags, summary: 'Give the user a temporary password', security, params: userIdParam, response: { 200: temporaryPasswordSchema } } }, controller.resetPassword);
  app.post('/users/:id/reset-totp', { preHandler: manage, schema: { tags, summary: 'Make the user set up a new authenticator', security, params: userIdParam, response: { 200: staffUserListSchema } } }, controller.resetTotp);

  const staffOnly = [requireAuth, requireRole('SUPER_ADMIN', 'ACCOUNTANT', 'SECRETARY', 'PRESIDENT', 'CASHIER', 'DDO')];
  app.post('/auth/staff/password', { preHandler: staffOnly, schema: { tags: ['auth'], summary: 'Change my staff password', security, body: changePasswordBody, response: { 200: okSchema } } }, controller.changeOwnPassword);
};
