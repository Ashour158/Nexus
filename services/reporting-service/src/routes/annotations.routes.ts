/**
 * Universal annotations & data-linking.
 *
 * A cross-cutting collaboration layer: any authenticated user in the tenant can
 * comment on / annotate ANY target (a report, dashboard, widget, a pinned data
 * point on a chart, or any CRM record), thread replies, @-mention, pin, and
 * resolve — and link ANY entity to ANY other entity with a typed relationship.
 *
 * Auth: relies on the service-wide JWT preHandler (all requests authenticated).
 * No extra permission grant is required — commenting/linking is available to any
 * member of the tenant. Mutation of an existing annotation is limited to its
 * author (or an admin). Everything is tenant-scoped.
 */
import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import type { ReportingPrisma } from '../prisma.js';

function jwtOf(req: unknown): JwtPayload {
  return (req as { user: JwtPayload }).user;
}
function isAdmin(jwt: JwtPayload): boolean {
  const roles = jwt.roles ?? [];
  return roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || (jwt.permissions ?? []).includes('*');
}
function bad(reply: any, requestId: unknown, message: string, code = 'VALIDATION_ERROR', status = 422) {
  return reply.code(status).send({ success: false, error: { code, message, requestId } });
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

export async function registerAnnotationRoutes(app: FastifyInstance, prisma: ReportingPrisma): Promise<void> {
  // ─── Annotations ───────────────────────────────────────────────────────────

  /** List the annotation thread for a target (top-level notes + their replies). */
  app.get('/api/v1/annotations', async (req, reply) => {
    const jwt = jwtOf(req);
    const q = req.query as { targetType?: string; targetId?: string; includeResolved?: string };
    const targetType = str(q.targetType);
    const targetId = str(q.targetId);
    if (!targetType || !targetId) return bad(reply, req.id, 'targetType and targetId are required');
    const where: Record<string, unknown> = { tenantId: jwt.tenantId, targetType, targetId, parentId: null };
    if (q.includeResolved !== 'true') where.resolved = false;
    const roots = await prisma.annotation.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: { replies: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    return reply.send({ success: true, data: roots });
  });

  /** Lightweight count for badges (open annotations on a target). */
  app.get('/api/v1/annotations/count', async (req, reply) => {
    const jwt = jwtOf(req);
    const q = req.query as { targetType?: string; targetId?: string };
    const targetType = str(q.targetType);
    const targetId = str(q.targetId);
    if (!targetType || !targetId) return bad(reply, req.id, 'targetType and targetId are required');
    const count = await prisma.annotation.count({
      where: { tenantId: jwt.tenantId, targetType, targetId, resolved: false },
    });
    return reply.send({ success: true, data: { count } });
  });

  /** Create an annotation (or a threaded reply when parentId is given). */
  app.post('/api/v1/annotations', async (req, reply) => {
    const jwt = jwtOf(req);
    const b = req.body as {
      targetType?: string; targetId?: string; body?: string; anchor?: unknown;
      parentId?: string; mentions?: unknown; pinned?: boolean;
    };
    const targetType = str(b.targetType);
    const targetId = str(b.targetId);
    const body = str(b.body);
    if (!targetType || !targetId) return bad(reply, req.id, 'targetType and targetId are required');
    if (!body) return bad(reply, req.id, 'body is required');
    // A reply must reference a parent in the same tenant/target.
    if (b.parentId) {
      const parent = await prisma.annotation.findFirst({
        where: { id: b.parentId, tenantId: jwt.tenantId, targetType, targetId },
        select: { id: true },
      });
      if (!parent) return bad(reply, req.id, 'parent annotation not found', 'NOT_FOUND', 404);
    }
    const mentions = Array.isArray(b.mentions) ? b.mentions.filter((m): m is string => typeof m === 'string') : [];
    const created = await prisma.annotation.create({
      data: {
        tenantId: jwt.tenantId,
        targetType,
        targetId,
        anchor: (b.anchor ?? undefined) as never,
        parentId: b.parentId ?? null,
        authorId: jwt.sub,
        authorName: jwt.email ?? null,
        body,
        mentions,
        pinned: Boolean(b.pinned),
      },
    });
    return reply.code(201).send({ success: true, data: created });
  });

  /** Edit body / pin / resolve — author or admin only. */
  app.patch('/api/v1/annotations/:id', async (req, reply) => {
    const jwt = jwtOf(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.annotation.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!existing) return bad(reply, req.id, 'Not found', 'NOT_FOUND', 404);
    const b = req.body as { body?: string; pinned?: boolean; resolved?: boolean };
    const isAuthor = existing.authorId === jwt.sub;
    // Pin/resolve are collaborative (any member); body edits are author/admin only.
    const data: Record<string, unknown> = {};
    if (typeof b.body === 'string') {
      if (!isAuthor && !isAdmin(jwt)) return bad(reply, req.id, 'Only the author can edit the text', 'FORBIDDEN', 403);
      const body = str(b.body);
      if (!body) return bad(reply, req.id, 'body cannot be empty');
      data.body = body;
    }
    if (typeof b.pinned === 'boolean') data.pinned = b.pinned;
    if (typeof b.resolved === 'boolean') {
      data.resolved = b.resolved;
      data.resolvedAt = b.resolved ? new Date() : null;
      data.resolvedById = b.resolved ? jwt.sub : null;
    }
    const updated = await prisma.annotation.update({ where: { id: existing.id }, data });
    return reply.send({ success: true, data: updated });
  });

  /** Delete an annotation (cascade-deletes its replies) — author or admin only. */
  app.delete('/api/v1/annotations/:id', async (req, reply) => {
    const jwt = jwtOf(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.annotation.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!existing) return bad(reply, req.id, 'Not found', 'NOT_FOUND', 404);
    if (existing.authorId !== jwt.sub && !isAdmin(jwt)) {
      return bad(reply, req.id, 'Only the author can delete', 'FORBIDDEN', 403);
    }
    await prisma.annotation.delete({ where: { id: existing.id } });
    return reply.send({ success: true, data: { id: existing.id, deleted: true } });
  });

  // ─── Data links ────────────────────────────────────────────────────────────

  /** All links touching an entity (either side), with the OTHER side resolved. */
  app.get('/api/v1/links', async (req, reply) => {
    const jwt = jwtOf(req);
    const q = req.query as { type?: string; id?: string };
    const type = str(q.type);
    const id = str(q.id);
    if (!type || !id) return bad(reply, req.id, 'type and id are required');
    const rows = await prisma.dataLink.findMany({
      where: {
        tenantId: jwt.tenantId,
        OR: [
          { fromType: type, fromId: id },
          { toType: type, toId: id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    // Normalize so the caller always sees {relation, otherType, otherId, direction}.
    const links = rows.map((r) => {
      const outgoing = r.fromType === type && r.fromId === id;
      return {
        id: r.id,
        relation: r.relation,
        label: r.label,
        note: r.note,
        direction: outgoing ? 'outgoing' : 'incoming',
        otherType: outgoing ? r.toType : r.fromType,
        otherId: outgoing ? r.toId : r.fromId,
        createdAt: r.createdAt,
      };
    });
    return reply.send({ success: true, data: links });
  });

  /** Create a typed link between two entities (idempotent on the unique triple). */
  app.post('/api/v1/links', async (req, reply) => {
    const jwt = jwtOf(req);
    const b = req.body as {
      fromType?: string; fromId?: string; toType?: string; toId?: string;
      relation?: string; label?: string; note?: string;
    };
    const fromType = str(b.fromType), fromId = str(b.fromId), toType = str(b.toType), toId = str(b.toId);
    if (!fromType || !fromId || !toType || !toId) {
      return bad(reply, req.id, 'fromType, fromId, toType, toId are required');
    }
    if (fromType === toType && fromId === toId) return bad(reply, req.id, 'cannot link an entity to itself');
    const relation = str(b.relation) ?? 'related';
    const link = await prisma.dataLink.upsert({
      where: {
        tenantId_fromType_fromId_toType_toId_relation: { tenantId: jwt.tenantId, fromType, fromId, toType, toId, relation },
      },
      create: {
        tenantId: jwt.tenantId, fromType, fromId, toType, toId, relation,
        label: str(b.label) ?? null, note: str(b.note) ?? null, createdById: jwt.sub,
      },
      update: { label: str(b.label) ?? null, note: str(b.note) ?? null },
    });
    return reply.code(201).send({ success: true, data: link });
  });

  /** Remove a link. */
  app.delete('/api/v1/links/:id', async (req, reply) => {
    const jwt = jwtOf(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.dataLink.findFirst({ where: { id, tenantId: jwt.tenantId } });
    if (!existing) return bad(reply, req.id, 'Not found', 'NOT_FOUND', 404);
    await prisma.dataLink.delete({ where: { id: existing.id } });
    return reply.send({ success: true, data: { id: existing.id, deleted: true } });
  });
}
