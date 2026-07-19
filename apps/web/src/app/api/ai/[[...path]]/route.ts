import { NextRequest, NextResponse } from 'next/server';
import {
  DEV_PREVIEW_ENABLED,
  apiError,
  apiSuccess,
} from '@/lib/server/dev-preview-data';

/**
 * BFF proxy for the explainable-AI endpoints under `${CRM_URL}/ai/**`:
 *   - GET  /ai/deals/:id/at-risk    → at-risk assessment
 *   - GET  /ai/models               → model version list
 *   - POST /ai/models/retrain       → retrain (admin), returns metrics or the
 *                                     "kept priors" reason
 *
 * Note: `/deals/:id/scoring-insights` and `/leads/:id/ai-prediction` already
 * flow through the existing deals/leads proxies and are NOT handled here.
 */

// This handler runs SERVER-SIDE, so it must reach crm-service by its internal
// URL. NEXT_PUBLIC_CRM_URL is `/bff/crm` in prod — a browser-relative path with
// no host — and a server-side fetch to it throws (→ 502 on /api/ai/models).
// Prefer the server-only CRM_SERVICE_URL (docker network name); fall back to the
// public/localhost value only for local dev.
const CRM_URL = process.env.CRM_SERVICE_URL
  ? `${process.env.CRM_SERVICE_URL}/api/v1`
  : process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';

type RouteContext = { params: { path?: string[] } };

function normalizePath(params: RouteContext['params']) {
  return params.path ?? [];
}

async function proxy(req: NextRequest, { params }: RouteContext, method: string) {
  const auth = req.headers.get('authorization');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = normalizePath(params).join('/');
  const body = method !== 'GET' ? await req.text() : undefined;
  const search = req.nextUrl.searchParams.toString();

  try {
    const res = await fetch(
      `${CRM_URL}/ai${path ? `/${path}` : ''}${method === 'GET' && search ? `?${search}` : ''}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
          'x-tenant-id': req.headers.get('x-tenant-id') ?? 'default',
        },
        body,
      }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(apiError('AI service unavailable', 'UPSTREAM_UNAVAILABLE'), {
      status: 502,
    });
  }
}

const SAMPLE_MODELS = [
  {
    id: 'model-deal-win',
    kind: 'deal-win',
    version: 'preview-v0',
    trainedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    sampleSize: 240,
    metrics: { auc: 0.78, brier: 0.16 },
    active: true,
  },
  {
    id: 'model-lead-convert',
    kind: 'lead-convert',
    version: 'preview-v0',
    trainedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    sampleSize: 180,
    metrics: { auc: 0.74, brier: 0.18 },
    active: true,
  },
];

async function handleDev(req: NextRequest, ctx: RouteContext, method: string) {
  const path = normalizePath(ctx.params);

  // GET /ai/deals/:id/at-risk
  if (method === 'GET' && path[0] === 'deals' && path[2] === 'at-risk') {
    const dealId = path[1];
    return NextResponse.json(
      apiSuccess({
        dealId,
        atRisk: true,
        riskScore: 0.62,
        reasons: [
          { label: 'Stalled in stage', detail: 'No stage movement in 21 days.' },
          { label: 'Thin MEDDIC', detail: 'Economic buyer not yet identified.' },
        ],
        recommendedActions: [
          'Re-engage the champion with a value recap.',
          'Confirm the decision timeline and budget owner.',
        ],
      })
    );
  }

  // GET /ai/models
  if (method === 'GET' && path[0] === 'models' && path.length === 1) {
    return NextResponse.json(apiSuccess(SAMPLE_MODELS));
  }

  // POST /ai/models/retrain
  if (method === 'POST' && path[0] === 'models' && path[1] === 'retrain') {
    const body = (await req.json().catch(() => ({}))) as { kind?: string };
    const kind = body.kind ?? 'deal-win';
    // Deterministic dev behaviour: pretend there isn't enough data yet, so the
    // model keeps its priors — this exercises the "kept priors" UI path.
    return NextResponse.json(
      apiSuccess({
        kind,
        retrained: false,
        keptPriors: true,
        reason: 'Not enough labelled outcomes yet — kept existing priors.',
        sampleSize: 42,
        minSampleSize: 200,
      })
    );
  }

  return NextResponse.json(apiError('Unsupported AI preview route'), { status: 404 });
}

export const GET = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'GET') : proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: RouteContext) =>
  DEV_PREVIEW_ENABLED ? handleDev(req, ctx, 'POST') : proxy(req, ctx, 'POST');
