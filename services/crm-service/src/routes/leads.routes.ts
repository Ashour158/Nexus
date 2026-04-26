import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  ConvertLeadSchema,
  CreateLeadSchema,
  IdParamSchema,
  LeadListQuerySchema,
  UpdateLeadSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createLeadsService } from '../services/leads.service.js';
import { createAttachmentsService } from '../services/attachments.service.js';

const MassIdsSchema = z.object({ ids: z.array(z.string().cuid()).min(1).max(200) });
const LeadMassUpdateSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
  data: z.object({
    ownerId: z.string().cuid().optional(),
    status: z.enum(['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).optional(),
    rating: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  }),
});
const AttachmentBodySchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().min(0),
  mimeType: z.string().min(1),
  contentBase64: z.string().optional(),
  storageKey: z.string().optional(),
});
const AttachmentIdParamSchema = z.object({
  id: z.string().cuid(),
  attachmentId: z.string().cuid(),
});

async function uploadToStorage(payload: {
  fileName: string;
  mimeType: string;
  contentBase64?: string;
}): Promise<string> {
  if (!payload.contentBase64) return `manual/${Date.now()}-${payload.fileName}`;
  const base = process.env.STORAGE_SERVICE_URL ?? 'http://localhost:3008';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const res = await fetch(`${base}/api/v1/objects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Storage upload failed');
  const body = (await res.json()) as { data?: { storageKey?: string } };
  return body.data?.storageKey ?? `fallback/${Date.now()}-${payload.fileName}`;
}

/**
 * Registers the `/api/v1/leads/*` route family — Section 34.2 → "Leads".
 */
export async function registerLeadsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const leads = createLeadsService(prisma, producer);
  const attachments = createAttachmentsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const parsed = LeadListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await leads.listLeads(
            jwt.tenantId,
            {
              ownerId: q.ownerId,
              status: q.status,
              source: q.source,
              rating: q.rating,
              search: q.search,
            },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/leads',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CREATE) },
        async (request, reply) => {
          const parsed = CreateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await leads.createLead(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: lead });
        }
      );

      r.post(
        '/leads/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const body = AttachmentBodySchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const storageKey = body.storageKey ?? (await uploadToStorage({
            fileName: body.fileName,
            mimeType: body.mimeType,
            contentBase64: body.contentBase64,
          }));
          const data = await attachments.createAttachment(
            jwt.tenantId,
            'lead',
            id,
            {
              fileName: body.fileName,
              fileSize: body.fileSize,
              mimeType: body.mimeType,
              storageKey,
            },
            jwt.sub
          );
          return reply.code(201).send({ success: true, data });
        }
      );

      r.get(
        '/leads/:id/attachments',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.listAttachments(jwt.tenantId, 'lead', id);
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/leads/:id/attachments/:attachmentId',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const p = AttachmentIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await attachments.deleteAttachment(jwt.tenantId, p.attachmentId);
          if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
          return reply.send({ success: true, data });
        }
      );

      r.patch(
        '/leads/mass-update',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const body = LeadMassUpdateSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await prisma.lead.updateMany({
            where: { tenantId: jwt.tenantId, id: { in: body.ids } },
            data: body.data,
          });
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/leads/mass-delete',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const body = MassIdsSchema.parse(request.body);
          const jwt = request.user as JwtPayload;
          const data = await prisma.lead.deleteMany({
            where: { tenantId: jwt.tenantId, id: { in: body.ids } },
          });
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/leads/:id/convert',
        { preHandler: requirePermission(PERMISSIONS.LEADS.CONVERT) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ConvertLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await leads.convertLead(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const lead = await leads.getLeadById(jwt.tenantId, id);
          return reply.send({ success: true, data: lead });
        }
      );

      r.patch(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateLeadSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const lead = await leads.updateLead(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: lead });
        }
      );

      r.delete(
        '/leads/:id',
        { preHandler: requirePermission(PERMISSIONS.LEADS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await leads.deleteLead(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
