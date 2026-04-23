import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  CreateNoteSchema,
  IdParamSchema,
  NoteListQuerySchema,
  PaginationSchema,
  UpdateNoteSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createNotesService } from '../services/notes.service.js';

const DealParamsSchema = z.object({ dealId: z.string().cuid() });
const ContactParamsSchema = z.object({ contactId: z.string().cuid() });
const LeadParamsSchema = z.object({ leadId: z.string().cuid() });

function isAdmin(jwt: JwtPayload): boolean {
  return (
    (jwt.roles ?? []).some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN') ||
    (jwt.permissions ?? []).includes('*')
  );
}

/**
 * Registers the `/api/v1/notes/*` route family (Section 34.3).
 * Author-only edits are enforced by passing `jwt.sub` into the service
 * layer; delete additionally allows admin-role callers to purge notes.
 */
export async function registerNotesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  const notes = createNotesService(prisma);

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
          const result = await notes.listNotes(
            jwt.tenantId,
            {
              dealId: q.dealId,
              contactId: q.contactId,
              leadId: q.leadId,
              accountId: q.accountId,
              isPinned: q.isPinned,
              authorId: q.authorId,
            },
            { page: q.page, limit: q.limit }
          );
          return reply.send({ success: true, data: result });
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
          const note = await notes.createNote(jwt.tenantId, {
            ...parsed.data,
            authorId: jwt.sub,
          });
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
          const note = await notes.getNoteById(jwt.tenantId, id);
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
          const note = await notes.updateNote(
            jwt.tenantId,
            id,
            parsed.data,
            jwt.sub
          );
          return reply.send({ success: true, data: note });
        }
      );

      // ─── DELETE ─────────────────────────────────────────────────────────
      r.delete(
        '/notes/:id',
        { preHandler: requirePermission(PERMISSIONS.NOTES.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await notes.deleteNote(jwt.tenantId, id, jwt.sub, {
            skipAuthorCheck: isAdmin(jwt),
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ─── PIN ────────────────────────────────────────────────────────────
      r.post(
        '/notes/:id/pin',
        { preHandler: requirePermission(PERMISSIONS.NOTES.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const note = await notes.pinNote(jwt.tenantId, id);
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
          const note = await notes.unpinNote(jwt.tenantId, id);
          return reply.send({ success: true, data: note });
        }
      );

      // ─── NOTES FOR DEAL ─────────────────────────────────────────────────
      r.get(
        '/deals/:dealId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { dealId } = DealParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await notes.listNotesForDeal(jwt.tenantId, dealId, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );

      // ─── NOTES FOR CONTACT ──────────────────────────────────────────────
      r.get(
        '/contacts/:contactId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { contactId } = ContactParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await notes.listNotesForContact(
            jwt.tenantId,
            contactId,
            { page: q.page, limit: q.limit }
          );
          return reply.send({ success: true, data: result });
        }
      );

      // ─── NOTES FOR LEAD ─────────────────────────────────────────────────
      r.get(
        '/leads/:leadId/notes',
        { preHandler: requirePermission(PERMISSIONS.NOTES.READ) },
        async (request, reply) => {
          const { leadId } = LeadParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await notes.listNotesForLead(jwt.tenantId, leadId, {
            page: q.page,
            limit: q.limit,
          });
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
