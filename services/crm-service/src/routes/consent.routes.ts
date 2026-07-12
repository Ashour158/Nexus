import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

const VALID_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'PROFILING', 'MARKETING'] as const;

/** Structural validation; `channel` enum membership is checked below. */
const CreateConsentSchema = z.object({
  channel: z.string().min(1),
  source: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
  ipAddress: z.string().optional(),
});

export async function registerConsentRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  app.get(
    '/api/v1/contacts/:contactId/consents',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const { contactId } = request.params as { contactId: string };
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: jwt.tenantId },
      });
      if (!contact)
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: request.id } });
      const consents = await prisma.consentRecord.findMany({
        where: { tenantId: jwt.tenantId, contactId },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ success: true, data: consents });
    }
  );

  app.post(
    '/api/v1/contacts/:contactId/consents',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const userId = jwt.sub;
      const { contactId } = request.params as { contactId: string };
      const parsedBody = CreateConsentSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw new ValidationError('Invalid body', parsedBody.error.flatten());
      }
      const body = parsedBody.data;
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: jwt.tenantId },
      });
      if (!contact)
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: request.id } });

      if (!VALID_CHANNELS.includes(body.channel as (typeof VALID_CHANNELS)[number])) {
        return reply.code(400).send({
          success: false,
          error: `channel must be one of: ${VALID_CHANNELS.join(', ')}`,
        });
      }

      const consent = await prisma.consentRecord.upsert({
        where: {
          tenantId_contactId_channel: {
            tenantId: jwt.tenantId,
            contactId,
            channel: body.channel,
          },
        },
        create: {
          tenantId: jwt.tenantId,
          contactId,
          channel: body.channel,
          status: 'GRANTED',
          grantedAt: new Date(),
          source: body.source ?? 'MANUAL',
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          notes: body.notes,
          ipAddress: body.ipAddress,
          recordedBy: userId,
        },
        update: {
          status: 'GRANTED',
          grantedAt: new Date(),
          withdrawnAt: null,
          source: body.source ?? 'MANUAL',
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          notes: body.notes,
          recordedBy: userId,
        },
      });
      return reply.code(201).send({ success: true, data: consent });
    }
  );

  app.delete(
    '/api/v1/contacts/:contactId/consents/:channel',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const userId = jwt.sub;
      const { contactId, channel } = request.params as { contactId: string; channel: string };
      const { reason } = (request.body as { reason?: string } | undefined) ?? {};
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: jwt.tenantId },
      });
      if (!contact)
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: request.id } });

      await prisma.consentRecord.upsert({
        where: {
          tenantId_contactId_channel: {
            tenantId: jwt.tenantId,
            contactId,
            channel,
          },
        },
        create: {
          tenantId: jwt.tenantId,
          contactId,
          channel,
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          recordedBy: userId,
          notes: reason,
        },
        update: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          recordedBy: userId,
          notes: reason,
        },
      });
      return reply.send({ success: true });
    }
  );

  app.get(
    '/api/v1/contacts/:contactId/consents/:channel/check',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const { contactId, channel } = request.params as { contactId: string; channel: string };
      const consent = await prisma.consentRecord.findUnique({
        where: {
          tenantId_contactId_channel: {
            tenantId: jwt.tenantId,
            contactId,
            channel,
          },
        },
      });
      const hasConsent =
        consent?.status === 'GRANTED' &&
        (!consent.expiresAt || consent.expiresAt > new Date());
      return reply.send({ success: true, data: { hasConsent, consent } });
    }
  );

  app.post(
    '/api/v1/contacts/:contactId/consents/grant-all',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const userId = jwt.sub;
      const { contactId } = request.params as { contactId: string };
      const body = request.body as { channels: string[]; source?: string; expiresAt?: string };
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, tenantId: jwt.tenantId },
      });
      if (!contact)
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Contact not found', requestId: request.id } });
      const channels = body.channels.filter((c) =>
        VALID_CHANNELS.includes(c as (typeof VALID_CHANNELS)[number])
      );
      const now = new Date();
      await Promise.all(
        channels.map((channel) =>
          prisma.consentRecord.upsert({
            where: {
              tenantId_contactId_channel: {
                tenantId: jwt.tenantId,
                contactId,
                channel,
              },
            },
            create: {
              tenantId: jwt.tenantId,
              contactId,
              channel,
              status: 'GRANTED',
              grantedAt: now,
              source: body.source ?? 'BULK',
              recordedBy: userId,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            },
            update: {
              status: 'GRANTED',
              grantedAt: now,
              withdrawnAt: null,
              source: body.source ?? 'BULK',
              recordedBy: userId,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            },
          })
        )
      );

      return reply.send({ success: true, data: { granted: channels } });
    }
  );

  app.get(
    '/api/v1/consents/re-consent-required',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
    async (request, reply) => {
      const jwt = request.user as JwtPayload;
      const tenantId = jwt.tenantId;
      const eighteenMonthsAgo = new Date();
      eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          updatedAt: { lt: eighteenMonthsAgo },
          consents: {
            some: {
              channel: 'MARKETING',
              status: 'GRANTED',
              grantedAt: { lt: eighteenMonthsAgo },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true, email: true, updatedAt: true },
        take: 200,
      });
      return reply.send({ success: true, data: contacts });
    }
  );
}
