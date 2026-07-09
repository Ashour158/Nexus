import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function GET(req: NextRequest, { params }: { params: { documentId: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const document = getDevPreviewState().quoteDocuments.find((item) => item.id === params.documentId);
    if (!document) return NextResponse.json(apiError('Quote document not found', 'NOT_FOUND'), { status: 404 });
    const content = document.contentBase64
      ? Buffer.from(document.contentBase64, 'base64')
      : Buffer.from(String(document.renderedHtml ?? ''), 'utf8');
    return new NextResponse(content, {
      headers: {
        'content-type': String(document.contentType ?? 'application/octet-stream'),
        'content-length': String(content.length),
        'content-disposition': `attachment; filename="${String(document.fileName ?? 'quote-document')}"`,
      },
    });
  }

  const res = await fetch(`${FINANCE_URL}/quote-documents/${params.documentId}/download`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const content = await res.arrayBuffer();
  return new NextResponse(content, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
    },
  });
}
