import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const rule = getDevPreviewState().scoringRules.find((candidate) => candidate.id === params.id);
    if (!rule) return NextResponse.json(apiError('Scoring rule not found', 'NOT_FOUND'), { status: 404 });

    Object.assign(rule, body);
    return NextResponse.json(apiSuccess(rule));
  }

  const tenantId = req.headers.get('x-tenant-id') || 'default';
  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/scoring-rules/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    state.scoringRules = state.scoringRules.filter((rule) => rule.id !== params.id);
    return NextResponse.json(apiSuccess({ id: params.id }));
  }

  const tenantId = req.headers.get('x-tenant-id') || 'default';
  try {
    await fetch(`${CRM_SERVICE}/api/v1/scoring-rules/${params.id}`, {
      method: 'DELETE',
      headers: { 'x-tenant-id': tenantId },
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(apiSuccess({ id: params.id }));
  }
}
