import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED } from '@/lib/server/dev-preview-data';
import { evaluateFormula } from '@/lib/server/metadata-mock-store';

const METADATA_SERVICE =
  process.env.METADATA_SERVICE_URL || 'http://localhost:3004';

export async function POST(req: NextRequest) {
  let payload: { formula?: string; record?: Record<string, unknown> };
  try {
    payload = (await req.json()) as { formula?: string; record?: Record<string, unknown> };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (DEV_PREVIEW_ENABLED) {
    // Match the real backend's fail-open `{ ok, value, error? }` shape so dev
    // and prod behave identically (the engine returns null on failure).
    const result = evaluateFormula(payload.formula ?? '', payload.record ?? {});
    if (result === null) {
      return NextResponse.json({
        success: true,
        data: { ok: false, value: null, error: 'Formula could not be evaluated' },
      });
    }
    return NextResponse.json({ success: true, data: { ok: true, value: result } });
  }

  try {
    const res = await fetch(`${METADATA_SERVICE}/api/v1/formula/evaluate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        authorization: req.headers.get('authorization') ?? '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Failed to connect to metadata service',
        },
      },
      { status: 503 }
    );
  }
}
