import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiSuccess,
  createId,
  getDevPreviewState,
} from '@/lib/server/dev-preview-data';

const CRM_SERVICE = process.env.CRM_SERVICE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  if (DEV_PREVIEW_ENABLED) {
    return NextResponse.json(apiSuccess(getDevPreviewState().scoringRules));
  }

  const tenantId = req.headers.get('x-tenant-id') || 'default';
  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/scoring-rules`, {
      headers: { 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess([]));
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (DEV_PREVIEW_ENABLED) {
    const state = getDevPreviewState();
    const rule = {
      id: createId('score'),
      name: String(body.name ?? 'New scoring rule'),
      signal: String(body.signal ?? 'email_opened'),
      points: Number(body.points ?? 0),
      isActive: body.isActive ?? true,
    };
    state.scoringRules.unshift(rule);
    return NextResponse.json(apiSuccess(rule), { status: 201 });
  }

  const tenantId = req.headers.get('x-tenant-id') || 'default';
  try {
    const res = await fetch(`${CRM_SERVICE}/api/v1/scoring-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, authorization: req.headers.get('authorization') ?? '' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiSuccess(null), { status: 202 });
  }
}
