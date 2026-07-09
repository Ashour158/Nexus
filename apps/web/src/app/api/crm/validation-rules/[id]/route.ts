import { NextRequest, NextResponse } from 'next/server';
import { DEV_PREVIEW_ENABLED, apiError, apiSuccess, getDevPreviewState } from '@/lib/server/dev-preview-data';

const C = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

function fwd(req: NextRequest): HeadersInit {
  return {
    'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
    authorization: req.headers.get('authorization') ?? '',
    'Content-Type': 'application/json',
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (DEV_PREVIEW_ENABLED) {
    const body = await req.json().catch(() => ({}));
    const state = getDevPreviewState();
    const index = state.validationRules.findIndex((rule) => rule.id === params.id);
    if (index === -1) return NextResponse.json(apiError('Validation rule not found', 'NOT_FOUND'), { status: 404 });
    state.validationRules[index] = {
      ...state.validationRules[index],
      ...body,
      id: state.validationRules[index].id,
      ruleType: 'required',
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(apiSuccess(state.validationRules[index]));
  }

  const body = await req.text();
  const res = await fetch(`${C}/api/v1/validation-rules/${params.id}`, {
    method: 'PATCH',
    headers: fwd(req),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    state.validationRules = state.validationRules.filter((rule) => rule.id !== params.id);
    return NextResponse.json(apiSuccess({ id: params.id, deleted: true }));
  }

  const res = await fetch(`${C}/api/v1/validation-rules/${params.id}`, {
    method: 'DELETE',
    headers: fwd(req),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
