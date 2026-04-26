import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

const QuerySpecSchema = z.object({
  entity: z.enum(['deal', 'lead', 'activity', 'account', 'contact']),
  columns: z.array(z.string()).optional(),
  filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).optional(),
  groupBy: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

function matchesFilter(row: Record<string, unknown>, filter: { field: string; operator: string; value: string }): boolean {
  const actual = row[filter.field];
  if (filter.operator === 'eq') return String(actual) === filter.value;
  if (filter.operator === 'in') return filter.value.split(',').map((v) => v.trim()).includes(String(actual));
  if (filter.operator === 'contains') return String(actual ?? '').toLowerCase().includes(filter.value.toLowerCase());
  return true;
}

function groupRows(rows: Record<string, unknown>[], groupBy?: string): Record<string, unknown>[] {
  if (!groupBy) return rows;
  const fields = groupBy.split(',').map((f) => f.trim()).filter(Boolean);
  const groups = new Map<string, { row: Record<string, unknown>; count: number; amount: number }>();
  for (const row of rows) {
    const key = fields.map((field) => String(row[field] ?? '')).join('|');
    const existing = groups.get(key) ?? {
      row: Object.fromEntries(fields.map((field) => [field, row[field] ?? null])),
      count: 0,
      amount: 0,
    };
    existing.count += 1;
    existing.amount += Number(row.amount ?? 0);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group.row,
    count: group.count,
    'sum(amount)': group.amount,
  }));
}

export async function registerCrmReportsRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/reports/query', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const body = z.object({ querySpec: QuerySpecSchema, params: z.record(z.unknown()).optional() }).parse(request.body);
        const take = body.querySpec.limit ?? 250;
        const where = { tenantId: jwt.tenantId };
        const source =
          body.querySpec.entity === 'deal'
            ? await prisma.deal.findMany({ where, take })
            : body.querySpec.entity === 'lead'
              ? await prisma.lead.findMany({ where, take })
              : body.querySpec.entity === 'activity'
                ? await prisma.activity.findMany({ where, take })
                : body.querySpec.entity === 'account'
                  ? await prisma.account.findMany({ where, take })
                  : await prisma.contact.findMany({ where, take });
        const filtered = (source as Array<Record<string, unknown>>).filter((row) =>
          (body.querySpec.filters ?? []).every((filter) => matchesFilter(row, filter))
        );
        const rows = groupRows(filtered, body.querySpec.groupBy);
        const columns = body.querySpec.columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
        return reply.send({ success: true, data: { columns, rows } });
      });
    },
    { prefix: '/api/v1' }
  );
}
