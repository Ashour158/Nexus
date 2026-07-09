import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiSuccess, validateDevObject } from '@/lib/server/dev-preview-data';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    const body = await req.json().catch(() => ({}));
    const result = validateDevObject(
      String(body.objectType ?? body.entity ?? 'contact'),
      (body.data ?? body.record ?? {}) as Record<string, unknown>
    );
    return NextResponse.json(apiSuccess(result), { status: result.valid ? 200 : 422 });
  }

  const body = await req.text();
  const res = await fetch(`${C}/api/v1/validation-rules/validate`, {
    method: 'POST',
    headers: {
      'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
      authorization: req.headers.get('authorization') ?? '',
      'Content-Type': 'application/json',
    },
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
