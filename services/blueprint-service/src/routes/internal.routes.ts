import type { FastifyInstance } from 'fastify';
import { ValidationError } from '@nexus/service-utils';
import { ValidateTransitionSchema } from '@nexus/validation';
import type { createValidationService } from '../services/validation.service.js';
import { alsStore } from '../request-context.js';

export async function registerBlueprintInternalRoutes(
  app: FastifyInstance,
  validation: ReturnType<typeof createValidationService>
): Promise<void> {
  app.post('/api/v1/blueprints/internal/validate-transition', async (request, reply) => {
    const expected = process.env.BLUEPRINT_SERVICE_TOKEN;
    const token = String(request.headers['x-blueprint-service-token'] ?? '');
    if (!expected || token !== expected) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing service token' },
      });
    }
    const tenantHeader = String(request.headers['x-tenant-id'] ?? '');
    if (!tenantHeader) {
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'X-Tenant-Id header is required' },
      });
    }
    const parsed = ValidateTransitionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid body', parsed.error.flatten());
    }
    const prev = alsStore.get('tenantId');
    alsStore.set('tenantId', tenantHeader);
    try {
      const data = await validation.validateTransition(parsed.data);
      return reply.send({ success: true, data });
    } finally {
      alsStore.set('tenantId', prev ?? '');
    }
  });
}
