import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

const AUDIT_CONSUMER_URL =
  process.env.AUDIT_CONSUMER_URL ?? 'http://localhost:3028';
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

const ALLOWED_FILTERS = [
  'operationType',
  'operationId',
  'operatorId',
  'sourceService',
  'targetDomain',
  'dryRun',
  'executed',
  'status',
  'correlationId',
  'from',
  'to',
  'limit',
  'cursor',
] as const;

const ALLOWED_OPERATION_TYPES = new Set([
  'cpq.transition.reconcile',
  'quoteProjection.replay',
  'financeTimeline.replay',
  'financeTimeline.idempotency_backfill_execute',
]);

type AuditRecord = {
  auditId?: unknown;
  tenantId?: unknown;
  operationType?: unknown;
  operationId?: unknown;
  operatorId?: unknown;
  actorType?: unknown;
  sourceService?: unknown;
  targetDomain?: unknown;
  targetProjection?: unknown;
  dryRun?: unknown;
  executed?: unknown;
  reason?: unknown;
  filtersSummary?: unknown;
  counts?: unknown;
  status?: unknown;
  warnings?: unknown;
  errors?: unknown;
  correlationId?: unknown;
  createdAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeObject(value: unknown): Record<string, unknown> {
  const source = asRecord(value);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (key.toLowerCase().includes('payload')) continue;
    if (item == null || ['string', 'number', 'boolean'].includes(typeof item)) {
      out[key] = item;
    }
  }
  return out;
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = asRecord(item);
      return [record.code, record.message].filter((part) => typeof part === 'string').join(': ') || 'redacted';
    })
    .slice(0, 20);
}

function sanitizeRecord(record: AuditRecord) {
  return {
    auditId: typeof record.auditId === 'string' ? record.auditId : '',
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : '',
    operationType: typeof record.operationType === 'string' ? record.operationType : '',
    operationId: typeof record.operationId === 'string' ? record.operationId : null,
    operatorId: typeof record.operatorId === 'string' ? record.operatorId : null,
    actorType: typeof record.actorType === 'string' ? record.actorType : null,
    sourceService: typeof record.sourceService === 'string' ? record.sourceService : null,
    targetDomain: typeof record.targetDomain === 'string' ? record.targetDomain : null,
    targetProjection: typeof record.targetProjection === 'string' ? record.targetProjection : null,
    dryRun: typeof record.dryRun === 'boolean' ? record.dryRun : null,
    executed: typeof record.executed === 'boolean' ? record.executed : null,
    reason: typeof record.reason === 'string' ? record.reason : null,
    filtersSummary: sanitizeObject(record.filtersSummary),
    counts: sanitizeObject(record.counts),
    status: typeof record.status === 'string' ? record.status : null,
    warnings: sanitizeList(record.warnings),
    errors: sanitizeList(record.errors),
    correlationId: typeof record.correlationId === 'string' ? record.correlationId : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : null,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
  };
}

function buildUpstreamQuery(req: NextRequest, tenantId: string): string | NextResponse {
  const out = new URLSearchParams();
  out.set('tenantId', tenantId);

  for (const key of ALLOWED_FILTERS) {
    const value = req.nextUrl.searchParams.get(key);
    if (!value) continue;
    if (key === 'operationType' && !ALLOWED_OPERATION_TYPES.has(value)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_OPERATION_TYPE', message: 'Unsupported operation type' } },
        { status: 400 }
      );
    }
    if (key === 'limit') {
      const parsed = Number(value);
      out.set('limit', String(Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.trunc(parsed), MAX_LIMIT) : DEFAULT_LIMIT));
      continue;
    }
    out.set(key, value);
  }

  if (!out.has('limit')) out.set('limit', String(DEFAULT_LIMIT));
  return out.toString();
}

export async function GET(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin(req);
  } catch {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json(
      { success: false, error: { code: 'AUDIT_PROXY_NOT_CONFIGURED', message: 'Audit proxy service token is not configured' } },
      { status: 500 }
    );
  }

  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? req.headers.get('x-tenant-id') ?? 'default';
  const query = buildUpstreamQuery(req, tenantId);
  if (typeof query !== 'string') return query;

  const res = await fetch(`${AUDIT_CONSUMER_URL}/api/v1/internal/audit/internal-operations?${query}`, {
    headers: {
      'x-service-token': serviceToken,
      'x-tenant-id': tenantId,
      'x-user-id': admin.userId,
    },
    cache: 'no-store',
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUDIT_CONSUMER_ERROR',
          message: asRecord(body).error && typeof asRecord(asRecord(body).error).message === 'string'
            ? String(asRecord(asRecord(body).error).message)
            : 'Audit consumer request failed',
        },
      },
      { status: res.status }
    );
  }

  const data = asRecord(asRecord(body).data);
  const records = Array.isArray(data.records) ? data.records.map((record) => sanitizeRecord(record as AuditRecord)) : [];
  return NextResponse.json({
    success: true,
    data: {
      records,
      pageInfo: asRecord(data.pageInfo),
    },
  });
}
