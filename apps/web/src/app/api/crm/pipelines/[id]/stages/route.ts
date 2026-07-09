import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (DEV_PREVIEW_ENABLED) {
    const pipeline = getDevPreviewState().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return NextResponse.json(apiError('Pipeline not found', 'NOT_FOUND'), { status: 404 });

    return NextResponse.json(apiSuccess([...pipeline.stages].sort((a, b) => a.order - b.order)));
  }

  try {
    const res = await fetch(`${C}/api/v1/pipelines/${params.id}/stages`, {
      headers: fwd(req),
      cache: 'no-store',
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.text();
  if (DEV_PREVIEW_ENABLED) {
    const pipeline = getDevPreviewState().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return NextResponse.json(apiError('Pipeline not found', 'NOT_FOUND'), { status: 404 });

    const parsed = body ? JSON.parse(body) : {};
    const stage = {
      id: createId('stage'),
      name: String(parsed.name ?? 'New Stage'),
      order: Number(parsed.order ?? pipeline.stages.length + 1),
      probability: Number(parsed.probability ?? 10),
      rottenDays: Number(parsed.rottenDays ?? 30),
      color: String(parsed.color ?? '#64748b'),
    };
    pipeline.stages.push(stage);
    return NextResponse.json(apiSuccess(stage), { status: 201 });
  }
  try {
    const res = await fetch(`${C}/api/v1/pipelines/${params.id}/stages`, {
      method: 'POST',
      headers: fwd(req),
      body,
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}
