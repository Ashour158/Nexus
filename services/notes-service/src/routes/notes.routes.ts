import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { toPaginatedResult } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  CreateNoteSchema,
  UpdateNoteSchema,
  IdParamSchema,
  NoteListQuerySchema,
  PaginationSchema,
} from '@nexus/validation';
import type { NexusProducer } from '@nexus/kafka';
import type { NotesPrisma } from '../prisma.js';
import { notifyMentions } from '../services/mentions.service.js';

/**
 * Registers the `/api/v1/notes/*` route family.
 *
 * `producer` is optional: when Kafka is available it is used to fan out
 * `@mention` notifications on note create/update. When absent, mention
 * notification is silently skipped and the note write path is unaffected.
 */
export async function registerNotesRoutes(
  app: FastifyInstance,
  prisma: NotesPrisma,
  producer?: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const parsed = NoteListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const where: { tenantId: string; deletedAt: null; dealId?: string; contactId?: string; leadId?: string; accountId?: string; authorId?: string; isPinned?: boolean } = { tenantId: jwt.tenantId, deletedAt: null };
          if (q.dealId) where.dealId = q.dealId;
          if (q.contactId) where.contactId = q.contactId;
          if (q.leadId) where.leadId = q.leadId;
          if (q.accountId) where.accountId = q.accountId;
          if (q.authorId) where.authorId = q.authorId;
          if (q.isPinned !== undefined) where.isPinned = q.isPinned;

          const [notes, total] = await Promise.all([
            prisma.note.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy: { createdAt: 'desc' },
            }),
            prisma.note.count({ where }),
          ]);

          return reply.send({ success: true, data: toPaginatedResult(notes, total, q.page, q.limit) });
        }
      );

      // ─── CREATE ─────────────────────────────────────────────────────────
      r.post(
        '/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.CREATE) },
        async (request, reply) => {
          const parsed = CreateNoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;

          // Entity reference integrity: a note must attach to exactly the record(s)
          // the caller specified. CreateNoteSchema already refines that at least one
          // of deal/contact/lead/account is present; re-assert defensively so a note
          // can never be persisted orphaned regardless of schema drift.
          if (
            !parsed.data.dealId &&
            !parsed.data.contactId &&
            !parsed.data.leadId &&
            !parsed.data.accountId
          ) {
            throw new ValidationError('Note must reference at least one entity', {
              formErrors: ['Note must reference at least one of deal/contact/lead/account'],
              fieldErrors: {},
            });
          }

          const note = await prisma.note.create({
            data: {
              content: parsed.data.content,
              isPinned: parsed.data.isPinned,
              mentions: parsed.data.mentions ?? [],
              dealId: parsed.data.dealId,
              contactId: parsed.data.contactId,
              leadId: parsed.data.leadId,
              accountId: parsed.data.accountId,
              tenantId: jwt.tenantId,
              authorId: jwt.sub,
            },
          });

          // Fire-and-forget @mention fan-out. Never blocks or fails the note write.
          void notifyMentions(prisma, producer, note as any);

          return reply.code(201).send({ success: true, data: note });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/notes/:id',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const note = await prisma.note.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!note) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Note not found', requestId: request.id },
            });
          }
          return reply.send({ success: true, data: note });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/notes/:id',
        { preHandler: requirePermission(PERMISSIONS.NOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateNoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data: { content?: string; isPinned?: boolean; mentions?: string[] } = {};
          if (parsed.data.content !== undefined) data.content = parsed.data.content;
          if (parsed.data.isPinned !== undefined) data.isPinned = parsed.data.isPinned;
          if (parsed.data.mentions !== undefined) data.mentions = parsed.data.mentions;
          const note = await prisma.note.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data,
          });

          // Notify only mentions not previously notified (idempotent per version).
          void notifyMentions(prisma, producer, note as any);

          return reply.send({ success: true, data: note });
        }
      );

      // ─── DELETE (soft) ──────────────────────────────────────────────────
      r.delete(
        '/notes/:id',
        { preHandler: requirePermission(PERMISSIONS.NOTES.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await prisma.note.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { deletedAt: new Date() },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ─── RESTORE ────────────────────────────────────────────────────────
      r.post(
        '/notes/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.NOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const note = await prisma.note.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { deletedAt: null },
          });
          return reply.send({ success: true, data: note });
        }
      );

      // ─── PIN ────────────────────────────────────────────────────────────
      r.post(
        '/notes/:id/pin',
        { preHandler: requirePermission(PERMISSIONS.NOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const note = await prisma.note.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { isPinned: true },
          });
          return reply.send({ success: true, data: note });
        }
      );

      // ─── UNPIN ──────────────────────────────────────────────────────────
      r.delete(
        '/notes/:id/pin',
        { preHandler: requirePermission(PERMISSIONS.NOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const note = await prisma.note.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: { isPinned: false },
          });
          return reply.send({ success: true, data: note });
        }
      );

      // ─── NOTES FOR DEAL ─────────────────────────────────────────────────
      r.get(
        '/deals/:dealId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { dealId } = z.object({ dealId: z.string().cuid() }).parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = { tenantId: jwt.tenantId, dealId, deletedAt: null };
          const [notes, total] = await Promise.all([
            prisma.note.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy: { createdAt: 'desc' },
            }),
            prisma.note.count({ where }),
          ]);
          return reply.send({ success: true, data: toPaginatedResult(notes, total, q.page, q.limit) });
        }
      );

      // ─── NOTES FOR CONTACT ──────────────────────────────────────────────
      r.get(
        '/contacts/:contactId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { contactId } = z.object({ contactId: z.string().cuid() }).parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = { tenantId: jwt.tenantId, contactId, deletedAt: null };
          const [notes, total] = await Promise.all([
            prisma.note.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy: { createdAt: 'desc' },
            }),
            prisma.note.count({ where }),
          ]);
          return reply.send({ success: true, data: toPaginatedResult(notes, total, q.page, q.limit) });
        }
      );

      // ─── NOTES FOR LEAD ─────────────────────────────────────────────────
      r.get(
        '/leads/:leadId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { leadId } = z.object({ leadId: z.string().cuid() }).parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = { tenantId: jwt.tenantId, leadId, deletedAt: null };
          const [notes, total] = await Promise.all([
            prisma.note.findMany({
              where,
              take: q.limit,
              skip: (q.page - 1) * q.limit,
              orderBy: { createdAt: 'desc' },
            }),
            prisma.note.count({ where }),
          ]);
          return reply.send({ success: true, data: toPaginatedResult(notes, total, q.page, q.limit) });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
