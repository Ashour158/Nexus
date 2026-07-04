import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { renderQuoteHtml, type QuoteData } from '../services/templates/quote.template.js';
import { renderContractHtml } from '../services/templates/contract.template.js';
import { htmlToPdf } from '../services/pdf.service.js';
import {
  storePdf,
  downloadUrlForKey,
  type DocumentStoragePrisma,
} from '../services/document-storage.service.js';

/** Prisma surface this route module needs beyond the storage helper's. */
interface DocumentsRoutesPrisma extends DocumentStoragePrisma {
  document: DocumentStoragePrisma['document'] & {
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string; storageKey: string; name: string } | null>;
  };
}

const QuoteIdParams = z.object({ quoteId: z.string().cuid() });
const DocumentIdParams = z.object({ documentId: z.string().uuid() });
const DownloadQuery = z.object({
  expirySeconds: z.coerce.number().min(60).max(604800).optional(),
});

/** Extract tenantId / userId from the verified JWT on the request. */
function principal(request: unknown): { tenantId: string; userId: string } {
  const u = (request as { user?: { tenantId?: string; sub?: string } }).user;
  return { tenantId: u?.tenantId ?? 'unknown', userId: u?.sub ?? 'unknown' };
}
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

export async function registerDocumentsRoutes(app: FastifyInstance, prisma?: DocumentsRoutesPrisma) {
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
    // GUARDED: persist to MinIO if configured; never block the PDF response.
    if (prisma) {
      const { tenantId, userId } = principal(request);
      const stored = await storePdf(prisma, request.log, {
        tenantId,
        ownerId: userId,
        name: `quote-${String(q.quoteNumber ?? 'NA')}.pdf`,
        bytes: pdf,
      });
      if (stored.documentId) reply.header('X-Document-Id', stored.documentId);
      if (stored.storageKey) reply.header('X-Storage-Key', stored.storageKey);
    }
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
    // GUARDED: persist to MinIO if configured; never block the PDF response.
    if (prisma) {
      const { tenantId, userId } = principal(request);
      const stored = await storePdf(prisma, request.log, {
        tenantId,
        ownerId: userId,
        name: `${body.template}.pdf`,
        bytes: pdf,
      });
      if (stored.documentId) reply.header('X-Document-Id', stored.documentId);
      if (stored.storageKey) reply.header('X-Storage-Key', stored.storageKey);
    }
    reply.header('Content-Type', 'application/pdf');
    return reply.send(pdf);
  });

  app.post('/api/v1/documents/esign/send', { preHandler: requirePermission(PERMISSIONS.DOCUMENTS.READ) }, async (request, reply) => {
    const body = EsignSendSchema.parse(request.body);

    // Generate PDF preview of the document
    const sanitizedData = sanitizeHtmlStrings(body.data) as Record<string, unknown>;
    const html =
      body.documentType === 'quote'
        ? renderQuoteHtml(sanitizedData as unknown as QuoteData)
        : renderContractHtml(sanitizedData);
    const pdf = await htmlToPdf(html);

    // GUARDED: persist the generated e-sign document to MinIO if configured.
    // Falls back to inline preview (existing behavior) when unavailable.
    let esignStorageKey: string | undefined;
    let esignDocumentId: string | undefined;
    if (prisma) {
      const { tenantId, userId } = principal(request);
      const stored = await storePdf(prisma, request.log, {
        tenantId,
        ownerId: userId,
        name: `${body.documentType}.pdf`,
        bytes: pdf,
      });
      esignStorageKey = stored.storageKey;
      esignDocumentId = stored.documentId;
    }

    const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;
    const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://demo.docusign.net/restapi';

    if (!accountId || !accessToken) {
      return reply.code(200).send({
        success: true,
        data: {
          envelopeId: null,
          status: 'PENDING_PROVIDER_CONFIGURATION',
          previewUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
          documentId: esignDocumentId ?? null,
          storageKey: esignStorageKey ?? null,
          signers: body.signers,
          message: 'DocuSign is not configured. Set DOCUSIGN_ACCOUNT_ID and DOCUSIGN_ACCESS_TOKEN to enable sending.',
        },
      });
    }

    const envelope = {
      emailSubject: body.subject ?? `Please sign: ${body.documentType}`,
      emailBlurb: body.message ?? 'Please review and sign the attached document.',
      documents: [{
        documentBase64: pdf.toString('base64'),
        name: `${body.documentType}.pdf`,
        fileExtension: 'pdf',
        documentId: '1',
      }],
      recipients: {
        signers: body.signers.map((s, i) => ({
          email: s.email,
          name: s.name,
          recipientId: String(i + 1),
          routingOrder: String(i + 1),
          tabs: {
            signHereTabs: [{
              anchorString: `/sn${i + 1}/`,
              anchorUnits: 'pixels',
              anchorXOffset: '0',
              anchorYOffset: '0',
            }],
          },
        })),
      },
      status: 'sent',
    };

    const dsRes = await fetch(`${baseUrl}/v2.1/accounts/${accountId}/envelopes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text().catch(() => 'unknown error');
      app.log.error({ status: dsRes.status, body: errText }, 'DocuSign envelope creation failed');
      return reply.code(502).send({
        success: false,
        error: { code: 'DOCUSIGN_ERROR', message: `DocuSign returned ${dsRes.status}: ${errText}` },
      });
    }

    const dsData = await dsRes.json() as { envelopeId: string; status: string };
    return reply.send({
      success: true,
      data: {
        envelopeId: dsData.envelopeId,
        status: dsData.status.toUpperCase(),
        documentId: esignDocumentId ?? null,
        storageKey: esignStorageKey ?? null,
        signers: body.signers,
      },
    });
  });

  // Presigned download URL for a stored document (mirrors storage-service).
  app.get(
    '/api/v1/documents/:documentId/download-url',
    { preHandler: requirePermission(PERMISSIONS.DOCUMENTS.READ) },
    async (request, reply) => {
      const { documentId } = DocumentIdParams.parse(request.params);
      const { expirySeconds } = DownloadQuery.parse(request.query);
      if (!prisma) {
        return reply.code(503).send({
          success: false,
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'Document persistence is not enabled.',
            requestId: request.id,
          },
        });
      }
      const { tenantId } = principal(request);
      const doc = await prisma.document.findFirst({
        where: { id: documentId, tenantId, isDeleted: false },
      });
      if (!doc) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Document not found', requestId: request.id },
        });
      }
      const result = downloadUrlForKey(request.log, doc.storageKey, expirySeconds ?? 3600);
      if (!result) {
        return reply.code(503).send({
          success: false,
          error: {
            code: 'STORAGE_UNAVAILABLE',
            message: 'Object storage is not configured for presigned downloads.',
            requestId: request.id,
          },
        });
      }
      return reply.send({
        success: true,
        data: { documentId: doc.id, name: doc.name, ...result },
      });
    }
  );
}
