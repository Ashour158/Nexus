import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createForecastsService } from '../services/forecasts.service.js';

const ForecastBody = z.object({
  period: z.string().min(1),
  commitAmount: z.union([z.string(), z.number()]),
  bestCaseAmount: z.union([z.string(), z.number()]),
  pipelineAmount: z.union([z.string(), z.number()]),
  commentary: z.string().optional(),
});
const ReviewBody = z.object({
  adjustedCommit: z.union([z.string(), z.number()]).optional(),
  adjustedBest: z.union([z.string(), z.number()]).optional(),
  note: z.string().optional(),
});

export async function registerForecastsRoutes(
  app: FastifyInstance,
  forecasts: ReturnType<typeof createForecastsService>
): Promise<void> {
  app.get('/api/v1/forecasts', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ period: z.string().optional(), ownerId: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await forecasts.listSubmissions(tenantId, query.period, query.ownerId) });
  });

  app.post('/api/v1/forecasts', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const body = ForecastBody.parse(request.body);
    const data = await forecasts.submitForecast(user.tenantId, user.sub, body.period, body);
    return reply.code(201).send({ success: true, data });
  });

  app.get('/api/v1/forecasts/rollup', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ period: z.string().min(1) }).parse(request.query);
    return reply.send({ success: true, data: await forecasts.getRollup(tenantId, query.period) });
  });

  app.post('/api/v1/forecasts/:id/review', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = ReviewBody.parse(request.body);
    const data = await forecasts.reviewForecast(user.tenantId, id, user.sub, body);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Submission not found', requestId: request.id } });
    return reply.send({ success: true, data });
  });

  // ─── ForecastReview lifecycle (SUBMITTED → APPROVED | ADJUSTED) ────────────

  // Open a review in SUBMITTED state for a submission.
  app.post('/api/v1/forecasts/:id/reviews', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const data = await forecasts.openReview(user.tenantId, id, user.sub);
    if (!data) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Submission not found', requestId: request.id } });
    return reply.code(201).send({ success: true, data });
  });

  // Approve an open review.
  app.post('/api/v1/forecasts/reviews/:reviewId/approve', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { reviewId } = z.object({ reviewId: z.string().cuid() }).parse(request.params);
    const body = z.object({ note: z.string().optional() }).parse(request.body ?? {});
    const result = await forecasts.transitionReview(user.tenantId, reviewId, user.sub, 'APPROVED', body);
    if (!result.ok) {
      const code = result.reason === 'NOT_FOUND' ? 404 : 409;
      return reply.code(code).send({ success: false, error: { code: result.reason, message: `Review ${result.reason === 'NOT_FOUND' ? 'not found' : 'cannot be approved from its current state'}`, requestId: request.id } });
    }
    return reply.send({ success: true, data: result.review });
  });

  // Adjust an open review (requires at least one adjusted amount).
  app.post('/api/v1/forecasts/reviews/:reviewId/adjust', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const { reviewId } = z.object({ reviewId: z.string().cuid() }).parse(request.params);
    const body = ReviewBody.parse(request.body);
    const result = await forecasts.transitionReview(user.tenantId, reviewId, user.sub, 'ADJUSTED', body);
    if (!result.ok) {
      const code = result.reason === 'NOT_FOUND' ? 404 : 409;
      return reply.code(code).send({ success: false, error: { code: result.reason, message: `Review ${result.reason === 'NOT_FOUND' ? 'not found' : 'cannot be adjusted (already decided or missing adjusted amounts)'}`, requestId: request.id } });
    }
    return reply.send({ success: true, data: result.review });
  });
}
