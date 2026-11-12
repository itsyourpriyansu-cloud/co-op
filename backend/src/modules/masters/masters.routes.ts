import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requireAuth, requirePermission } from '../../common/guards';
import { MastersController } from './masters.controller';
import {
  loanProductInput,
  productParams,
  productVersionsSchema,
  ratesSchema,
  settingsBundleSchema,
  settingsInput,
  settingsVersionsSchema,
  societyInput,
  templateInput,
  templateParams,
  templateSchema,
} from './masters.schema';
import { z } from 'zod';

/** ST-60…66 settings & master files, ST-63 templates, MB-16 rates (docs/22 §5 P2). */
export const mastersRoutes: FastifyPluginAsyncZod = async (app) => {
  const controller = new MastersController(app.masters);
  const tags = ['settings & masters'];
  const security = [{ bearer: [] }];
  const view = requirePermission('settings.view');
  const edit = requirePermission('settings.edit', 'Only the Super Admin can change settings.');

  app.get('/settings', { onRequest: view, schema: { tags, summary: 'Society profile, settings, loan products and recent changes', security, response: { 200: settingsBundleSchema } } }, controller.bundle);
  app.put('/settings/society', { onRequest: edit, schema: { tags, summary: 'Update the society profile', security, body: societyInput, response: { 200: settingsBundleSchema } } }, controller.updateSociety);
  app.put('/settings/values', { onRequest: edit, schema: { tags, summary: 'Change settings (creates a new active version)', security, body: settingsInput, response: { 200: settingsBundleSchema } } }, controller.updateSettings);
  app.put('/settings/loan-products/:code', { onRequest: edit, schema: { tags, summary: 'Change a loan product (creates a new active version)', security, params: productParams, body: loanProductInput, response: { 200: settingsBundleSchema } } }, controller.updateProduct);
  app.get('/settings/versions', { onRequest: view, schema: { tags, summary: 'Every settings version, newest first', security, response: { 200: settingsVersionsSchema } } }, controller.settingsVersions);
  app.get('/settings/loan-products/:code/versions', { onRequest: view, schema: { tags, summary: 'Every version of a loan product, newest first', security, params: productParams, response: { 200: productVersionsSchema } } }, controller.productVersions);

  app.get('/notification-templates', { onRequest: view, schema: { tags, summary: 'Message templates', security, response: { 200: z.array(templateSchema) } } }, controller.templates);
  app.put('/notification-templates/:key', { onRequest: edit, schema: { tags, summary: 'Edit a message template', security, params: templateParams, body: templateInput, response: { 200: z.array(templateSchema) } } }, controller.updateTemplate);

  // G4 (D-114): read before sign-in, so an app too old to use is stopped at the door.
  app.get('/app/config', { schema: { tags, summary: 'Oldest app version allowed (no sign-in needed)', response: { 200: z.object({ minAppVersion: z.string() }) } } }, controller.appConfig);
  app.get('/reference/rates', { onRequest: requireAuth, schema: { tags, summary: 'Rate card for members and staff (MB-16)', security, response: { 200: ratesSchema } } }, controller.rates);
};
