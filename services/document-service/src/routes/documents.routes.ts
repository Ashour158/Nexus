import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { renderQuoteHtml, type QuoteData } from '../services/templates/quote.template.js';
import { renderContractHtml } from '../services/templates/contract.template.js';
import { htmlToPdf } from '../services/pdf.service.js';

const QuoteIdParams = z.object({ quoteId: z.string().cuid() });
const RenderSchema = z.object({
  template: z.enum(['quote', 'contract']),
  data: z.record(z.unknown()),
});

const EsignSendSchema = z.object({
  documentType: z.enum(['quote', 'contract', 'agreement']),
  data: z.record(z.unknown()),
  signers: z.array(z.object({ name: z.string(), email: z.string().email() })),
  subject: z.string().optional(),
  message: z.string().optional(),
});

function authHeader(req: { headers: Record<string, string | string[] | undefined> }): Record<string, string> {
  const raw = req.headers.authorization;
  return typeof raw === 'string' ? { Authorization: raw } : {};
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHtmlStrings(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return escapeHtml(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeHtmlStrings);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeHtmlStrings(v)])
    );
  }
  return obj;
}

export async function registerDocumentsRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/documents/quotes/:quoteId/pdf',
    { preHandler: requirePermission(PERMISSIONS.DOCUMENTS.READ) },
    async (request, reply) => {
    const { quoteId } = QuoteIdParams.parse(request.params);
    const financeBase = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
    const res = await fetch(`${financeBase}/api/v1/quotes/${quoteId}`, {
      headers: authHeader(request as { headers: Record<string, string | string[] | undefined> }),
    });
    if (!res.ok) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found', requestId: request.id } });
    }
    const quote = (await res.json()) as { data?: Record<string, unknown> };
    const q = (quote.data ?? {}) as Record<string, unknown>;
    const lineItemsRaw = Array.isArray(q.lineItems) ? q.lineItems : [];
    const lineItems = lineItemsRaw.map((x) => {
      const row = x as Record<string, unknown>;
      return {
        name: String(row.productName ?? row.name ?? 'Item'),
        description: typeof row.description === 'string' ? row.description : '',
        qty: Number(row.quantity ?? 1),
        unitPrice: String(row.unitPrice ?? '0'),
        discount: String(row.discountPercent ?? row.discount ?? '0'),
        total: String(row.total ?? '0'),
      };
    });
    const html = renderQuoteHtml({
      quoteNumber: String(q.quoteNumber ?? 'Q-NA'),
      name: String(q.name ?? 'Quote'),
      validUntil: q.validUntil ? String(q.validUntil) : undefined,
      currency: String(q.currency ?? 'USD'),
      subtotal: String(q.subtotal ?? '0'),
      discountAmount: String(q.discountAmount ?? q.discountTotal ?? '0'),
      taxAmount: String(q.taxAmount ?? q.taxTotal ?? '0'),
      total: String(q.total ?? '0'),
      terms: typeof q.terms === 'string' ? q.terms : undefined,
      notes: typeof q.notes === 'string' ? q.notes : undefined,
      lineItems,
    } satisfies QuoteData);
    const pdf = await htmlToPdf(html);
    reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="quote-${String(q.quoteNumber ?? 'NA')}.pdf"`
      );
    return reply.send(pdf);
  });

  app.post(
    '/api/v1/documents/render',
    { preHandler: requirePermission(PERMISSIONS.DOCUMENTS.READ) },
    async (request, reply) => {
    const body = RenderSchema.parse(request.body);
    const sanitizedData = sanitizeHtmlStrings(body.data) as Record<string, unknown>;
    const html =
      body.template === 'quote'
        ? renderQuoteHtml(sanitizedData as unknown as QuoteData)
        : renderContractHtml(sanitizedData);
    const pdf = await htmlToPdf(html);
    reply.header('Content-Type', 'application/pdf');
    return reply.send(pdf);
  });

  app.post('/api/v1/documents/esign/send', { preHandler: requirePermission(PERMISSIONS.DOCUMENTS.UPDATE) }, async (request, reply) => {
    const body = EsignSendSchema.parse(request.body);

    // Generate PDF preview of the document
    const sanitizedData = sanitizeHtmlStrings(body.data) as Record<string, unknown>;
    const html =
      body.documentType === 'quote'
        ? renderQuoteHtml(sanitizedData as unknown as QuoteData)
        : renderContractHtml(sanitizedData);
    const pdf = await htmlToPdf(html);

    const docuSignConfigured =
      process.env.DOCUSIGN_INTEGRATION_KEY &&
      process.env.DOCUSIGN_ACCOUNT_ID;

    if (!docuSignConfigured) {
      return reply.code(200).send({
        success: true,
        data: {
          envelopeId: null,
          status: 'PENDING_PROVIDER_CONFIGURATION',
          previewUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
          signers: body.signers,
          message:
            'DocuSign is not configured. Document preview generated. Set DOCUSIGN_INTEGRATION_KEY and DOCUSIGN_ACCOUNT_ID to enable sending.',
        },
      });
    }

    // DocuSign SDK integration is pending. Credentials are configured but envelope creation is not yet implemented.
    return reply.code(503).send({
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'DocuSign envelope creation is not yet implemented. Document preview is available.',
      },
      data: {
        envelopeId: null,
        status: 'PENDING_IMPLEMENTATION',
        previewUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
        signers: body.signers,
      },
    });
  });
}
