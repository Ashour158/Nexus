import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { CommPrisma } from '../prisma.js';
import type { WhatsAppChannel } from '../channels/whatsapp.channel.js';

export async function registerWhatsAppOutboundRoutes(
  app: FastifyInstance,
  prisma: CommPrisma,
  whatsapp: WhatsAppChannel
): Promise<void> {
  app.post(
    '/api/v1/whatsapp/send',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const tenantId = jwt.tenantId ?? 'default';
      const userId = jwt.sub ?? 'system';
      const body = req.body as {
        to: string;
        type: 'text' | 'template' | 'document' | 'image';
        text?: string;
        templateName?: string;
        templateLanguage?: string;
        templateComponents?: unknown[];
        documentUrl?: string;
        documentName?: string;
        imageUrl?: string;
        caption?: string;
        contactId?: string;
        dealId?: string;
      };

      if (!whatsapp.isConfigured()) {
        return reply.code(503).send({
          success: false,
          error: 'WhatsApp Business API not configured',
          requiresConfig: true,
          hint: 'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in comm-service environment',
        });
      }

      const result = await whatsapp.sendMessage({
        to: body.to,
        type: body.type,
        text: body.text,
        templateName: body.templateName,
        templateLanguage: body.templateLanguage,
        templateComponents: body.templateComponents,
        documentUrl: body.documentUrl,
        documentName: body.documentName,
        imageUrl: body.imageUrl,
        caption: body.caption,
      });

      await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          contactId: body.contactId,
          dealId: body.dealId,
          direction: 'OUTBOUND',
          from: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'system',
          to: body.to,
          body:
            body.text ??
            `[${body.type}: ${body.templateName ?? body.documentName ?? 'media'}]`,
          status: 'SENT',
          externalId: result.messageId,
          sentBy: userId,
        },
      });

      return reply.send({ success: true, data: { messageId: result.messageId } });
    }
  );

  app.get(
    '/api/v1/whatsapp/thread/:contactId',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const tenantId = jwt.tenantId ?? 'default';
      const { contactId } = req.params as { contactId: string };
      const messages = await prisma.whatsAppMessage.findMany({
        where: { tenantId, contactId },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      return reply.send({ success: true, data: messages });
    }
  );

  app.post('/api/v1/whatsapp/webhook/status', async (req, reply) => {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{ id: string; status: string; timestamp: string }>;
          };
        }>;
      }>;
    };

    const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
    for (const status of statuses) {
      await prisma.whatsAppMessage.updateMany({
        where: { externalId: status.id },
        data: { status: status.status.toUpperCase() },
      });
    }
    return reply.send({ success: true });
  });

  app.post(
    '/api/v1/whatsapp/send-quote/:quoteId',
    { preHandler: requirePermission(PERMISSIONS.CONTACTS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const tenantId = jwt.tenantId ?? 'default';
      const { quoteId } = req.params as { quoteId: string };
      const body = req.body as {
        to: string;
        contactId?: string;
        dealId?: string;
        message?: string;
      };

      if (!whatsapp.isConfigured()) {
        return reply.code(503).send({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'WhatsApp not configured', requestId: req.id } });
      }

      const financeBase = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
      const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
      const quoteRes = await fetch(`${financeBase}/api/v1/quotes/${quoteId}`, {
        headers: {
          'x-tenant-id': tenantId,
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      if (!quoteRes.ok) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found', requestId: req.id } });
      }
      const envelope = (await quoteRes.json()) as {
        success?: boolean;
        data?: { name: string; quoteNumber?: string; total?: unknown; currency?: string };
      };
      const quote = envelope.data;
      if (!quote) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found', requestId: req.id } });
      }

      const caption =
        body.message ??
        `Please find your quote ${quote.quoteNumber ?? quoteId}. Reply with any questions.`;

      /** Meta requires a publicly reachable HTTPS URL for documents; fallback to plain text when unset. */
      const docUrl =
        process.env.WHATSAPP_QUOTE_DOCUMENT_URL_TEMPLATE?.replace('{quoteId}', quoteId) ?? '';

      const result = docUrl
        ? await whatsapp.sendMessage({
            to: body.to,
            type: 'document',
            documentUrl: docUrl,
            documentName: `Quote_${quote.quoteNumber ?? quoteId}.pdf`,
            caption,
          })
        : await whatsapp.sendMessage({
            to: body.to,
            type: 'text',
            text: `${caption}\n\n${quote.name} — Total: ${String(quote.total ?? '')} ${quote.currency ?? ''}`.trim(),
          });

      await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          contactId: body.contactId,
          dealId: body.dealId,
          direction: 'OUTBOUND',
          from: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'system',
          to: body.to,
          body: `[Quote sent: ${quote.name}]`,
          status: 'SENT',
          externalId: result.messageId,
        },
      });

      return reply.send({ success: true, data: { messageId: result.messageId } });
    }
  );
}
