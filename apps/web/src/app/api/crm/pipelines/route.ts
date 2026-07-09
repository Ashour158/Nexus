import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().pipelines));
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${C}/api/v1/pipelines${qs ? `?${qs}` : ''}`, {
      headers: fwd(req),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (DEV_PREVIEW_ENABLED) {
    const parsed = body ? JSON.parse(body) : {};
    const pipeline = {
      id: createId('pipeline'),
      name: String(parsed.name ?? 'New Pipeline'),
      currency: String(parsed.currency ?? 'USD'),
      isDefault: false,
      isActive: true,
      stages: Array.isArray(parsed.stages)
        ? parsed.stages.map((stage: Record<string, unknown>, index: number) => ({
            id: createId('stage'),
            name: String(stage.name ?? `Stage ${index + 1}`),
            order: Number(stage.order ?? index + 1),
            probability: Number(stage.probability ?? 10),
            rottenDays: Number(stage.rottenDays ?? 30),
            color: String(stage.color ?? '#64748b'),
          }))
        : [],
    };
    getDevPreviewState().pipelines.unshift(pipeline);
    return NextResponse.json(apiSuccess(pipeline), { status: 201 });
  }
  try {
    const res = await fetch(`${C}/api/v1/pipelines`, {
      method: 'POST',
      headers: fwd(req),
      body,
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}
