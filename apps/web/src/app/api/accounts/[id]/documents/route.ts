import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const CRM_SERVICE_URL = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function accountDocuments(account: { customFields?: Record<string, unknown> }) {
  const docs = account.customFields?.documents;
  return Array.isArray(docs) ? docs : [];
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (DEV_PREVIEW_ENABLED) {
    const account = getDevPreviewState().accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    return NextResponse.json(apiSuccess(accountDocuments(account)));
  }

  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/attachments`, {
    headers: {
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const account = state.accounts.find((item) => item.id === params.id);
    if (!account) return NextResponse.json(apiError('Account not found', 'NOT_FOUND'), { status: 404 });
    const now = new Date().toISOString();
    const document = {
      id: `acct-doc-${Date.now()}`,
      fileName: String(body.fileName ?? body.name ?? 'Account document'),
      mimeType: String(body.mimeType ?? 'application/octet-stream'),
      fileSize: Number(body.fileSize ?? body.size ?? 0),
      category: String(body.category ?? 'account'),
      uploadedBy: String(req.headers.get('x-user-id') ?? account.ownerId ?? 'dev-admin'),
      createdAt: now,
      updatedAt: now,
    };
    const existing = accountDocuments(account);
    account.customFields = { ...(account.customFields ?? {}), documents: [document, ...existing] };
    account.updatedAt = now;
    return NextResponse.json(apiSuccess(account.customFields.documents), { status: 201 });
  }

  const payload = {
    fileName: body.fileName ?? body.name,
    fileSize: body.fileSize ?? body.size ?? 0,
    mimeType: body.mimeType ?? 'application/octet-stream',
    contentBase64: body.contentBase64,
    storageKey: body.storageKey,
  };
  const res = await fetch(`${CRM_SERVICE_URL}/api/v1/accounts/${params.id}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: auth ?? '',
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
