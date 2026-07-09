import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, createId, getDevPreviewState } from '@/lib/server/dev-preview-data';

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL || 'http://localhost:3002';

function isDocxZip(contentBase64: string) {
  const signature = Buffer.from(contentBase64, 'base64').subarray(0, 4).toString('hex').toUpperCase();
  return signature === '504B0304';
}

function validateTemplate(body: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const name = String(body.name ?? '').trim();
  const contentType = String(body.contentType ?? 'text/html');
  const htmlBody = String(body.body ?? '').trim();
  const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64 : '';

  if (name.length < 3) errors.name = 'Template name must be at least 3 characters.';
  if (!['text/html', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(contentType)) {
    errors.contentType = 'Template must be HTML or DOCX.';
  }
  if (contentType === 'text/html' && !htmlBody.includes('{{quoteNumber}}')) {
    errors.body = 'HTML quote templates must include at least {{quoteNumber}}.';
  }
  if (contentType.includes('wordprocessingml') && (!contentBase64 || !isDocxZip(contentBase64))) {
    errors.contentBase64 = 'Uploaded DOCX template is invalid or empty.';
  }

  return { valid: Object.keys(errors).length === 0, errors, name, contentType, contentBase64 };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  if (DEV_PREVIEW_ENABLED) {
    const rows = [...getDevPreviewState().quoteTemplates].sort((left, right) =>
      `${String(left.name)}-${Number(right.version)}`.localeCompare(`${String(right.name)}-${Number(left.version)}`)
    );
    return NextResponse.json(apiSuccess(rows));
  }
  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/quote-templates`, {
    headers: { authorization: auth ?? '', 'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default' },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth && !DEV_PREVIEW_ENABLED) return NextResponse.json(apiError('Unauthorized'), { status: 401 });
  const body = await req.json();
  const validation = validateTemplate(body);
  if (!validation.valid) {
    return NextResponse.json(
      { ...apiError('Quote template failed validation', 'VALIDATION_ERROR'), details: validation.errors },
      { status: 422 }
    );
  }
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const now = new Date().toISOString();
    const template = {
      id: createId('qt'),
      tenantId: 'default',
      name: validation.name,
      description: body.description ?? null,
      version: Number(body.version ?? 1),
      status: body.status ?? 'ACTIVE',
      language: body.language ?? 'en',
      storageKey: body.storageKey ?? createId('quote-template'),
      contentType: validation.contentType,
      body: body.body ?? null,
      contentBase64: validation.contentBase64 || null,
      sourceFormat: validation.contentType.includes('wordprocessingml') ? 'DOCX' : 'HTML',
      variables: Array.isArray(body.variables) ? body.variables : [],
      isDefault: Boolean(body.isDefault ?? false),
      isActive: Boolean(body.isActive ?? true),
      createdAt: now,
      updatedAt: now,
    };
    if (template.isDefault) {
      for (const item of state.quoteTemplates) item.isDefault = false;
    }
    state.quoteTemplates.unshift(template);
    return NextResponse.json(apiSuccess(template), { status: 201 });
  }
  const res = await fetch(`${FINANCE_SERVICE_URL}/api/v1/quote-templates`, {
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
