import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, createId, getDevPreviewState } from '@/lib/server/dev-preview-data';
import { buildPreviewDocxBuffer, buildPreviewPdfBuffer } from '@/lib/server/quote-document-preview';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const quote = state.quotes.find((item) => item.id === params.id);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    const now = new Date().toISOString();
    const format = String(body.format ?? 'PDF').toUpperCase();
    const renderedHtml = `<h1>${quote.quoteNumber}</h1><p>${quote.name}</p><p>Total ${quote.currency} ${quote.total}</p>`;
    const previewContent =
      format === 'DOCX'
        ? buildPreviewDocxBuffer(quote)
        : format === 'PDF'
          ? buildPreviewPdfBuffer(quote)
          : Buffer.from(renderedHtml, 'utf8');
    const contentBase64 = previewContent.toString('base64');
    const document = {
      id: createId('qdoc'),
      tenantId: 'default',
      quoteId: quote.id,
      templateId: body.templateId ?? state.quoteTemplates.find((item) => item.isDefault)?.id ?? null,
      format,
      status: 'RENDERED',
      fileName: `${quote.quoteNumber}-v${quote.version}.${format.toLowerCase()}`,
      contentType: format === 'DOCX' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : format === 'PDF' ? 'application/pdf' : 'text/html',
      renderedHtml,
      contentBase64,
      contentSize: previewContent.length,
      checksum: `preview-${format.toLowerCase()}`,
      renderData: { quoteNumber: quote.quoteNumber, quoteVersion: quote.version, renderedAs: format },
      createdAt: now,
      updatedAt: now,
    };
    state.quoteDocuments.unshift(document);
    return NextResponse.json(apiSuccess(document), { status: 201 });
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
