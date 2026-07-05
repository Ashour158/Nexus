import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, createId, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_URL = `${process.env.FINANCE_SERVICE_URL ?? 'http://finance-service:3002'}/api/v1`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const quote = state.quotes.find((item) => item.id === params.id);
    if (!quote) return NextResponse.json(apiError('Quote not found', 'NOT_FOUND'), { status: 404 });
    const now = new Date().toISOString();
    const envelope = {
      id: createId('qenv'),
      tenantId: 'default',
      quoteId: quote.id,
      documentId: body.documentId ?? null,
      provider: body.provider ?? 'INTERNAL',
      providerEnvelopeId: createId('env'),
      status: 'SENT',
      recipientName: String(body.recipientName ?? 'Customer signer'),
      recipientEmail: String(body.recipientEmail ?? 'customer@example.com'),
      sentById: 'dev-admin',
      sentAt: now,
      expiresAt: body.expiresAt ?? quote.expiresAt ?? null,
      auditTrail: [{ action: 'SENT', actor: 'dev-admin', at: now }],
      createdAt: now,
      updatedAt: now,
    };
    state.quoteESignEnvelopes.unshift(envelope);
    return NextResponse.json(apiSuccess(envelope), { status: 201 });
  }
  const res = await fetch(`${FINANCE_URL}/quotes/${params.id}/esign/send`, {
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
