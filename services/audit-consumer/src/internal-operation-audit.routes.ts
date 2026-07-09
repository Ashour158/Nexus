import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

const SUPPORTED_OPERATION_TYPES = [
  'cpq.transition.reconcile',
  'quoteProjection.replay',
  'financeTimeline.replay',
  'financeTimeline.idempotency_backfill_execute',
] as const;

const auditQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  operationType: z.enum(SUPPORTED_OPERATION_TYPES).optional(),
  operationId: z.string().min(1).optional(),
  operatorId: z.string().min(1).optional(),
  sourceService: z.string().min(1).optional(),
  targetDomain: z.string().min(1).optional(),
  dryRun: z.coerce.boolean().optional(),
  executed: z.coerce.boolean().optional(),
  status: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
});

type AuditQuery = z.infer<typeof auditQuerySchema>;

type JsonRecord = Record<string, unknown>;

type AuditLogRow = {
  id: string;
  tenantId: string;
  actorId: string;
  actorType: string;
  action: string;
  resource: string;
  resourceId: string | null;
  changes?: unknown;
  metadata: unknown;
  timestamp: Date;
  correlationId: string | null;
};

export type AuditReadPrisma = {
  auditLog: {
    findMany(args: any): Promise<AuditLogRow[]>;
  };
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getMetadata(row: AuditLogRow): JsonRecord {
  return isJsonRecord(row.metadata) ? row.metadata : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeList(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isJsonRecord(item)) {
        const code = asString(item.code);
        const message = asString(item.message);
        return [code, message].filter(Boolean).join(': ') || 'redacted';
      }
      return String(item);
    })
    .slice(0, 20);
}

function sanitizeObject(value: unknown): JsonRecord | undefined {
  if (!isJsonRecord(value)) return undefined;
  const sanitized: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().includes('payload')) continue;
    if (item == null || ['string', 'number', 'boolean'].includes(typeof item)) {
      sanitized[key] = item;
    }
  }
  return sanitized;
}

function sanitizeAuditLog(row: AuditLogRow) {
  const metadata = getMetadata(row);
  return {
    auditId: row.id,
    tenantId: row.tenantId,
    operationType: row.action,
    operationId: row.resourceId ?? asString(metadata.operationId) ?? null,
    operatorId: row.actorId,
    actorType: row.actorType,
    sourceService: asString(metadata.sourceService) ?? null,
    targetDomain: asString(metadata.targetDomain) ?? null,
    targetProjection: asString(metadata.targetProjection) ?? null,
    dryRun: asBoolean(metadata.dryRun) ?? null,
    executed: asBoolean(metadata.executed) ?? null,
    reason: asString(metadata.reason) ?? null,
    filtersSummary: sanitizeObject(metadata.filters) ?? {},
    counts: sanitizeObject(metadata.counts) ?? {},
    status: asString(metadata.status) ?? null,
    warnings: sanitizeList(metadata.warnings),
    errors: sanitizeList(metadata.errors),
    correlationId: row.correlationId ?? asString(metadata.correlationId) ?? null,
    createdAt: row.timestamp.toISOString(),
    startedAt: asString(metadata.startedAt) ?? null,
    completedAt: asString(metadata.completedAt) ?? null,
  };
}

function verifyServiceToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const actual = request.headers['x-service-token'];
  if (!expected || actual !== expected) {
    reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Internal service token required',
      },
    });
    return false;
  }
  return true;
}

function buildWhere(query: AuditQuery, tenantId: string) {
  const and: JsonRecord[] = [];

  if (query.sourceService) {
    and.push({ metadata: { path: ['sourceService'], equals: query.sourceService } });
  }
  if (query.targetDomain) {
    and.push({
      OR: [
        { metadata: { path: ['targetDomain'], equals: query.targetDomain } },
        { metadata: { path: ['targetProjection'], equals: query.targetDomain } },
      ],
    });
  }
  if (query.dryRun !== undefined) {
    and.push({ metadata: { path: ['dryRun'], equals: query.dryRun } });
  }
  if (query.executed !== undefined) {
    and.push({ metadata: { path: ['executed'], equals: query.executed } });
  }
  if (query.status) {
    and.push({ metadata: { path: ['status'], equals: query.status } });
  }

  const timestamp: JsonRecord = {};
  if (query.from) timestamp.gte = query.from;
  if (query.to) timestamp.lte = query.to;

  const where: JsonRecord = {
    tenantId,
    resource: 'internal_operation',
    ...(query.operationType
      ? { action: query.operationType }
      : { action: { in: [...SUPPORTED_OPERATION_TYPES] } }),
    ...(query.operationId ? { resourceId: query.operationId } : {}),
    ...(query.operatorId ? { actorId: query.operatorId } : {}),
    ...(Object.keys(timestamp).length > 0 ? { timestamp } : {}),
    ...(query.correlationId
      ? {
          OR: [
            { correlationId: query.correlationId },
            { metadata: { path: ['correlationId'], equals: query.correlationId } },
          ],
        }
      : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };

  return where;
}

export function registerInternalOperationAuditRoutes(app: FastifyInstance, prisma: AuditReadPrisma): void {
  app.get('/api/v1/internal/audit/internal-operations', async (request, reply) => {
    if (!verifyServiceToken(request, reply)) return reply;

    const parsed = auditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_AUDIT_QUERY',
          message: 'Invalid audit query parameters',
          details: parsed.error.flatten(),
        },
      });
    }

    const tenantId = parsed.data.tenantId ?? asString(request.headers['x-tenant-id']);
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'TENANT_REQUIRED',
          message: 'tenantId is required for internal operation audit reads',
        },
      });
    }

    const limit = Math.min(parsed.data.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const rows = await prisma.auditLog.findMany({
      where: buildWhere(parsed.data, tenantId),
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    });

    const records = rows.map(sanitizeAuditLog);
    return {
      success: true,
      data: {
        records,
        pageInfo: {
          limit,
          returned: records.length,
          nextCursor: records.length === limit ? records[records.length - 1]?.auditId ?? null : null,
        },
      },
    };
  });
}
