import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

/** Structural validation; role/sentiment enum values are checked below. */
const CreateStakeholderSchema = z.object({
  contactId: z.string().min(1),
  role: z.string().min(1),
  influence: z.number().optional(),
  sentiment: z.string().optional(),
  reportsToId: z.string().min(1).nullish(),
  notes: z.string().optional(),
});

const UpdateStakeholderSchema = z.object({
  role: z.string().min(1).optional(),
  influence: z.number().optional(),
  sentiment: z.string().optional(),
  reportsToId: z.string().min(1).nullish(),
  notes: z.string().optional(),
});

const VALID_ROLES = [
  'Champion',
  'EconomicBuyer',
  'Blocker',
  'Influencer',
  'User',
  'TechnicalBuyer',
  'Coach',
] as const;

const VALID_SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Unknown'] as const;

/** Select shape matched to stakeholder UI (+ optional `title` alias for legacy). */
function contactStakeholderSelect() {
  return {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    jobTitle: true,
    phone: true,
  } as const;
}

export async function registerStakeholderRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/deals/:dealId/stakeholders',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };
          const stakeholders = await prisma.dealStakeholder.findMany({
            where: { tenantId: jwt.tenantId, dealId },
            include: {
              contact: { select: contactStakeholderSelect() },
              reportsTo: {
                select: {
                  id: true,
                  contact: { select: { firstName: true, lastName: true } },
                },
              },
              reports: {
                select: {
                  id: true,
                  contact: { select: { firstName: true, lastName: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          });
          const data = stakeholders.map((s) => ({
            ...s,
            contact: s.contact
              ? {
                  ...s.contact,
                  title: (s.contact as { jobTitle?: string | null }).jobTitle ?? null,
                }
              : s.contact,
          }));
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/deals/:dealId/stakeholders',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };
          const deal = await prisma.deal.findFirst({
            where: { id: dealId, tenantId: jwt.tenantId },
          });
          if (!deal) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal not found', requestId: request.id } });

          const parsedBody = CreateStakeholderSchema.safeParse(request.body);
          if (!parsedBody.success) {
            throw new ValidationError('Invalid body', parsedBody.error.flatten());
          }
          const body = parsedBody.data;

          if (!VALID_ROLES.includes(body.role as (typeof VALID_ROLES)[number])) {
            return reply.code(400).send({
              success: false,
              error: `role must be one of: ${VALID_ROLES.join(', ')}`,
            });
          }
          let resolvedSentiment = 'Neutral';
          if (body.sentiment !== undefined && body.sentiment !== null && body.sentiment !== '') {
            if (!VALID_SENTIMENTS.includes(body.sentiment as (typeof VALID_SENTIMENTS)[number])) {
              return reply.code(400).send({
                success: false,
                error: `sentiment must be one of: ${VALID_SENTIMENTS.join(', ')}`,
              });
            }
            resolvedSentiment = body.sentiment;
          }

          const contactOk = await prisma.contact.findFirst({
            where: { id: body.contactId, tenantId: jwt.tenantId },
          });
          if (!contactOk) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: request.id } });

          if (body.reportsToId) {
            const supervisor = await prisma.dealStakeholder.findFirst({
              where: {
                id: body.reportsToId,
                tenantId: jwt.tenantId,
                dealId,
              },
            });
            if (!supervisor)
              return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid reportsToId', requestId: request.id } });
          }

          const stakeholder = await prisma.dealStakeholder.create({
            data: {
              tenantId: jwt.tenantId,
              dealId,
              contactId: body.contactId,
              role: body.role,
              influence: body.influence ?? 50,
              sentiment: resolvedSentiment,
              reportsToId: body.reportsToId ?? undefined,
              notes: body.notes,
            },
            include: {
              contact: { select: contactStakeholderSelect() },
            },
          });
          const withTitle = stakeholder.contact
            ? {
                ...stakeholder,
                contact: {
                  ...stakeholder.contact,
                  title: stakeholder.contact.jobTitle ?? null,
                },
              }
            : stakeholder;
          return reply.code(201).send({ success: true, data: withTitle });
        }
      );

      r.patch(
        '/deals/:dealId/stakeholders/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId, id } = request.params as { dealId: string; id: string };
          const parsedBody = UpdateStakeholderSchema.safeParse(request.body);
          if (!parsedBody.success) {
            throw new ValidationError('Invalid body', parsedBody.error.flatten());
          }
          const body = parsedBody.data;

          const existing = await prisma.dealStakeholder.findFirst({
            where: { id, tenantId: jwt.tenantId, dealId },
          });
          if (!existing)
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Stakeholder not found', requestId: request.id } });

          if (body.role !== undefined && !VALID_ROLES.includes(body.role as (typeof VALID_ROLES)[number])) {
            return reply.code(400).send({
              success: false,
              error: `role must be one of: ${VALID_ROLES.join(', ')}`,
            });
          }
          if (
            body.sentiment !== undefined &&
            !VALID_SENTIMENTS.includes(body.sentiment as (typeof VALID_SENTIMENTS)[number])
          ) {
            return reply.code(400).send({
              success: false,
              error: `sentiment must be one of: ${VALID_SENTIMENTS.join(', ')}`,
            });
          }

          if (body.reportsToId) {
            const supervisor = await prisma.dealStakeholder.findFirst({
              where: { id: body.reportsToId, tenantId: jwt.tenantId, dealId },
            });
            if (!supervisor)
              return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid reportsToId', requestId: request.id } });
            if (body.reportsToId === id) {
              return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Stakeholder cannot report to themselves', requestId: request.id } });
            }
          }

          const stakeholder = await prisma.dealStakeholder.update({
            where: { id },
            data: {
              ...(body.role !== undefined ? { role: body.role } : {}),
              ...(body.influence !== undefined ? { influence: body.influence } : {}),
              ...(body.sentiment !== undefined ? { sentiment: body.sentiment } : {}),
              ...(body.reportsToId !== undefined ? { reportsToId: body.reportsToId } : {}),
              ...(body.notes !== undefined ? { notes: body.notes } : {}),
            },
            include: { contact: { select: contactStakeholderSelect() } },
          });
          const withTitle = stakeholder.contact
            ? {
                ...stakeholder,
                contact: {
                  ...stakeholder.contact,
                  title: stakeholder.contact.jobTitle ?? null,
                },
              }
            : stakeholder;
          return reply.send({ success: true, data: withTitle });
        }
      );

      r.delete(
        '/deals/:dealId/stakeholders/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId, id } = request.params as { dealId: string; id: string };
          const existing = await prisma.dealStakeholder.findFirst({
            where: { id, tenantId: jwt.tenantId, dealId },
          });
          if (!existing)
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Stakeholder not found', requestId: request.id } });

          await prisma.dealStakeholder.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
