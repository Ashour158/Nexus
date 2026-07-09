import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } }
) {
  const body = await req.text();
  if (DEV_PREVIEW_ENABLED) {
    const pipeline = getDevPreviewState().pipelines.find((candidate) => candidate.id === params.id);
    const stage = pipeline?.stages.find((candidate) => candidate.id === params.stageId);
    if (!pipeline || !stage) return NextResponse.json(apiError('Stage not found', 'NOT_FOUND'), { status: 404 });

    Object.assign(stage, body ? JSON.parse(body) : {});
    pipeline.stages.sort((a, b) => a.order - b.order).forEach((candidate, index) => {
      candidate.order = index + 1;
    });
    return NextResponse.json(apiSuccess(stage));
  }

  try {
    const res = await fetch(`${C}/api/v1/pipelines/${params.id}/stages/${params.stageId}`, {
      method: 'PATCH',
      headers: fwd(req),
      body,
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } }
) {
  if (DEV_PREVIEW_ENABLED) {
    const pipeline = getDevPreviewState().pipelines.find((candidate) => candidate.id === params.id);
    if (!pipeline) return NextResponse.json(apiError('Pipeline not found', 'NOT_FOUND'), { status: 404 });

    pipeline.stages = pipeline.stages.filter((stage) => stage.id !== params.stageId);
    pipeline.stages.sort((a, b) => a.order - b.order).forEach((stage, index) => {
      stage.order = index + 1;
    });
    return NextResponse.json(apiSuccess({ id: params.stageId }));
  }

  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(
      `${C}/api/v1/pipelines/${params.id}/stages/${params.stageId}${qs ? `?${qs}` : ''}`,
      { method: 'DELETE', headers: fwd(req) }
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess({ id: params.stageId }));
  }
}
