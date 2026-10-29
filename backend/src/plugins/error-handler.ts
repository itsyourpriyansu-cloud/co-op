import type { ServiceErrorBody } from '@tgs/types';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError } from '../common/errors/app-error';

/**
 * Every error leaves the server in the documented shape `{ code, message, fieldErrors?, ruleId? }`
 * (docs/11 §1), so the apps' existing error handling works unchanged.
 */
export const errorHandlerPlugin = fp(
  async (app) => {
    app.setErrorHandler((err: FastifyError, request, reply) => {
      if (err instanceof AppError) return reply.status(err.status).send(err.body);

      if (hasZodFastifySchemaValidationErrors(err)) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.validation) {
          const path = issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || 'request';
          fieldErrors[path] ??= issue.message ?? 'Invalid value';
        }
        const body: ServiceErrorBody = { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fieldErrors };
        return reply.status(400).send(body);
      }

      if (isResponseSerializationError(err)) {
        request.log.error({ err }, 'response did not match its schema');
      } else if (err.statusCode && err.statusCode < 500) {
        // Fastify's own client errors (bad JSON, body too large, …).
        const code = err.statusCode === 404 ? 'NOT_FOUND' : err.statusCode === 401 ? 'UNAUTHENTICATED' : 'VALIDATION_ERROR';
        return reply.status(err.statusCode).send({ code, message: err.message } satisfies ServiceErrorBody);
      } else {
        request.log.error({ err }, 'unexpected error');
      }
      // Same body as the mock API for unexpected failures (the apps show "Try again").
      return reply.status(500).send({ code: 'NETWORK', message: 'Unexpected server error.' } satisfies ServiceErrorBody);
    });

    app.setNotFoundHandler((request, reply) => {
      reply
        .status(404)
        .send({ code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url.split('?')[0]}` } satisfies ServiceErrorBody);
    });
  },
  { name: 'error-handler' },
);
