import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requirePermission } from '../../common/guards';
import { PermissionsController } from './permissions.controller';
import { permissionMatrixSchema, roleParamSchema, updatePermissionsSchema } from './permissions.schema';

/** ST-62 permission matrix (docs/03 §2). */
export const permissionsRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new PermissionsController(app.permissions);
  const tags = ['users & permissions'];

  app.get(
    '/permissions',
    { preHandler: requirePermission('settings.view'), schema: { tags, summary: 'Role → permission matrix', security: [{ bearer: [] }], response: { 200: permissionMatrixSchema } } },
    controller.matrix,
  );

  app.put(
    '/permissions/:role',
    {
      preHandler: requirePermission('users.manage', 'Only the Super Admin can change permissions.'),
      schema: {
        tags,
        summary: "Replace one console role's permissions",
        security: [{ bearer: [] }],
        params: roleParamSchema,
        body: updatePermissionsSchema,
        response: { 200: permissionMatrixSchema },
      },
    },
    controller.update,
  );
};
