import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createKnowledgeService } from '../services/knowledge.service.js';

const ArticleBody = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  body: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  dealStages: z.array(z.string()).default([]),
});

export async function registerKnowledgeRoutes(
  app: FastifyInstance,
  knowledge: ReturnType<typeof createKnowledgeService>
): Promise<void> {
  app.get('/api/v1/knowledge/categories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await knowledge.listCategories(tenantId) });
  });
  app.post('/api/v1/knowledge/categories', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z.object({ name: z.string().min(1), icon: z.string().optional(), parentCategoryId: z.string().optional(), position: z.number().optional() }).parse(request.body);
    return reply.code(201).send({ success: true, data: await knowledge.createCategory(tenantId, body) });
  });
  app.get('/api/v1/knowledge/articles', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ categoryId: z.string().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(), search: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await knowledge.listArticles(tenantId, query) });
  });
  app.post('/api/v1/knowledge/articles', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    return reply.code(201).send({ success: true, data: await knowledge.createArticle(user.tenantId, user.sub, ArticleBody.parse(request.body)) });
  });
  app.get('/api/v1/knowledge/articles/for-stage/:stageId', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { stageId } = z.object({ stageId: z.string().min(1) }).parse(request.params);
    return reply.send({ success: true, data: await knowledge.getArticlesForStage(tenantId, stageId) });
  });
  app.get('/api/v1/knowledge/articles/top', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(request.query);
    return reply.send({ success: true, data: await knowledge.getTopArticles(tenantId, limit) });
  });
  app.get('/api/v1/knowledge/articles/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const data = await knowledge.getArticle(tenantId, id);
    if (!data) return reply.code(404).send({ success: false, error: 'Article not found' });
    return reply.send({ success: true, data });
  });
  app.patch('/api/v1/knowledge/articles/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const data = await knowledge.updateArticle(tenantId, id, ArticleBody.partial().parse(request.body));
    if (!data) return reply.code(404).send({ success: false, error: 'Article not found' });
    return reply.send({ success: true, data });
  });
  app.post('/api/v1/knowledge/articles/:id/publish', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await knowledge.publishArticle(tenantId, id) });
  });
  app.post('/api/v1/knowledge/articles/:id/archive', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await knowledge.archiveArticle(tenantId, id) });
  });
  app.post('/api/v1/knowledge/articles/:id/view', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const user = (request as unknown as { user: { sub: string } }).user;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ dealStage: z.string().optional() }).parse(request.body ?? {});
    return reply.send({ success: true, data: await knowledge.recordView(id, user.sub, body.dealStage) });
  });
}
