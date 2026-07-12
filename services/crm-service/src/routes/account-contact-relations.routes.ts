import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

/** Structural validation; influence/sentiment enum values are checked below. */
const CreateRelationSchema = z.object({
  contactId: z.string().min(1),
  role: z.string().min(1),
  isPrimary: z.boolean().optional(),
  isDirect: z.boolean().optional(),
  influence: z.string().nullish(),
  sentiment: z.string().nullish(),
  reportsToContactId: z.string().nullish(),
  isChampion: z.boolean().optional(),
  notes: z.string().nullish(),
});

const UpdateRelationSchema = z.object({
  role: z.string().min(1).optional(),
  isPrimary: z.boolean().optional(),
  isDirect: z.boolean().optional(),
  influence: z.string().nullish(),
  sentiment: z.string().nullish(),
  reportsToContactId: z.string().nullish(),
  isChampion: z.boolean().optional(),
  notes: z.string().nullish(),
});

/** Contact fields returned when listing an account's related contacts. */
function relatedContactSelect() {
  return {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    jobTitle: true,
  } as const;
}

/** Account fields returned when listing a contact's related accounts. */
function relatedAccountSelect() {
  return {
    id: true,
    name: true,
    industry: true,
  } as const;
}

const VALID_INFLUENCE = ['HIGH', 'MEDIUM', 'LOW'] as const;
const VALID_SENTIMENT = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;

function notFound(reply: import('fastify').FastifyReply, requestId: string, message: string) {
  return reply
    .code(404)
    .send({ success: false, error: { code: 'NOT_FOUND', message, requestId } });
}

function validationError(reply: import('fastify').FastifyReply, requestId: string, message: string) {
  return reply
    .code(400)
    .send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
}

export async function registerAccountContactRelationsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      // GET /accounts/:id/related-contacts
      r.get(
        '/accounts/:id/related-contacts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };

          const account = await prisma.account.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!account) return notFound(reply, request.id, 'Account not found');

          const relations = await prisma.accountContactRelation.findMany({
            where: { tenantId: jwt.tenantId, accountId: id },
            include: { contact: { select: relatedContactSelect() } },
            orderBy: { createdAt: 'asc' },
          });
          return reply.send({ success: true, data: relations });
        }
      );

      // POST /accounts/:id/related-contacts  (upsert on [tenantId, accountId, contactId])
      r.post(
        '/accounts/:id/related-contacts',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const parsedBody = CreateRelationSchema.safeParse(request.body);
          if (!parsedBody.success) {
            throw new ValidationError('Invalid body', parsedBody.error.flatten());
          }
          const body = parsedBody.data;

          if (
            body.influence != null &&
            body.influence !== '' &&
            !VALID_INFLUENCE.includes(body.influence as (typeof VALID_INFLUENCE)[number])
          ) {
            return validationError(reply, request.id, `influence must be one of: ${VALID_INFLUENCE.join(', ')}`);
          }
          if (
            body.sentiment != null &&
            body.sentiment !== '' &&
            !VALID_SENTIMENT.includes(body.sentiment as (typeof VALID_SENTIMENT)[number])
          ) {
            return validationError(reply, request.id, `sentiment must be one of: ${VALID_SENTIMENT.join(', ')}`);
          }

          const account = await prisma.account.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!account) return notFound(reply, request.id, 'Account not found');

          const contact = await prisma.contact.findFirst({
            where: { id: body.contactId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!contact) return notFound(reply, request.id, 'Contact not found');

          if (body.reportsToContactId) {
            if (body.reportsToContactId === body.contactId) {
              return validationError(reply, request.id, 'Contact cannot report to themselves');
            }
            const supervisor = await prisma.contact.findFirst({
              where: { id: body.reportsToContactId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!supervisor) return validationError(reply, request.id, 'Invalid reportsToContactId');
          }

          const relation = await prisma.accountContactRelation.upsert({
            where: {
              tenantId_accountId_contactId: {
                tenantId: jwt.tenantId,
                accountId: id,
                contactId: body.contactId,
              },
            },
            create: {
              tenantId: jwt.tenantId,
              accountId: id,
              contactId: body.contactId,
              role: body.role,
              isPrimary: body.isPrimary ?? false,
              isDirect: body.isDirect ?? true,
              influence: body.influence ?? undefined,
              sentiment: body.sentiment ?? undefined,
              reportsToContactId: body.reportsToContactId ?? undefined,
              isChampion: body.isChampion ?? false,
              notes: body.notes ?? undefined,
            },
            update: {
              role: body.role,
              ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
              ...(body.isDirect !== undefined ? { isDirect: body.isDirect } : {}),
              ...(body.influence !== undefined ? { influence: body.influence } : {}),
              ...(body.sentiment !== undefined ? { sentiment: body.sentiment } : {}),
              ...(body.reportsToContactId !== undefined
                ? { reportsToContactId: body.reportsToContactId }
                : {}),
              ...(body.isChampion !== undefined ? { isChampion: body.isChampion } : {}),
              ...(body.notes !== undefined ? { notes: body.notes } : {}),
            },
            include: { contact: { select: relatedContactSelect() } },
          });
          return reply.code(201).send({ success: true, data: relation });
        }
      );

      // PATCH /account-contact-relations/:id
      r.patch(
        '/account-contact-relations/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const parsedBody = UpdateRelationSchema.safeParse(request.body);
          if (!parsedBody.success) {
            throw new ValidationError('Invalid body', parsedBody.error.flatten());
          }
          const body = parsedBody.data;

          const existing = await prisma.accountContactRelation.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!existing) return notFound(reply, request.id, 'Relation not found');

          if (
            body.influence != null &&
            body.influence !== '' &&
            !VALID_INFLUENCE.includes(body.influence as (typeof VALID_INFLUENCE)[number])
          ) {
            return validationError(reply, request.id, `influence must be one of: ${VALID_INFLUENCE.join(', ')}`);
          }
          if (
            body.sentiment != null &&
            body.sentiment !== '' &&
            !VALID_SENTIMENT.includes(body.sentiment as (typeof VALID_SENTIMENT)[number])
          ) {
            return validationError(reply, request.id, `sentiment must be one of: ${VALID_SENTIMENT.join(', ')}`);
          }
          if (body.reportsToContactId) {
            if (body.reportsToContactId === existing.contactId) {
              return validationError(reply, request.id, 'Contact cannot report to themselves');
            }
            const supervisor = await prisma.contact.findFirst({
              where: { id: body.reportsToContactId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!supervisor) return validationError(reply, request.id, 'Invalid reportsToContactId');
          }

          const relation = await prisma.accountContactRelation.update({
            where: { id },
            data: {
              ...(body.role !== undefined ? { role: body.role } : {}),
              ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
              ...(body.isDirect !== undefined ? { isDirect: body.isDirect } : {}),
              ...(body.influence !== undefined ? { influence: body.influence } : {}),
              ...(body.sentiment !== undefined ? { sentiment: body.sentiment } : {}),
              ...(body.reportsToContactId !== undefined
                ? { reportsToContactId: body.reportsToContactId }
                : {}),
              ...(body.isChampion !== undefined ? { isChampion: body.isChampion } : {}),
              ...(body.notes !== undefined ? { notes: body.notes } : {}),
            },
            include: { contact: { select: relatedContactSelect() } },
          });
          return reply.send({ success: true, data: relation });
        }
      );

      // DELETE /account-contact-relations/:id
      r.delete(
        '/account-contact-relations/:id',
        { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const existing = await prisma.accountContactRelation.findFirst({
            where: { id, tenantId: jwt.tenantId },
          });
          if (!existing) return notFound(reply, request.id, 'Relation not found');

          await prisma.accountContactRelation.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );

      // GET /contacts/:id/related-accounts
      r.get(
        '/contacts/:id/related-accounts',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };

          const contact = await prisma.contact.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!contact) return notFound(reply, request.id, 'Contact not found');

          const relations = await prisma.accountContactRelation.findMany({
            where: { tenantId: jwt.tenantId, contactId: id },
            include: { account: { select: relatedAccountSelect() } },
            orderBy: { createdAt: 'asc' },
          });
          return reply.send({ success: true, data: relations });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
