import type { ReportingPrisma } from '../prisma.js';

export type ReportFilter = {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in' | 'isNull' | 'isNotNull';
  value?: unknown;
};

export type ReportObjectType =
  | 'deals'
  | 'contacts'
  | 'activities'
  | 'leads'
  | 'accounts'
  | 'orders'
  | 'invoices'
  | 'tickets'
  | 'campaigns'
  | 'subscriptions'
  | 'commissions'
  | 'revenue'
  | 'quotes'
  | 'pipeline_analytics'
  | 'revenue_analytics';

export type ReportQuery = {
  objectType: ReportObjectType;
  columns: string[];
  filters: ReportFilter[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

/** UI / builder field keys → CRM Prisma field names per entity. */
const FIELD_MAP: Record<string, Record<string, string>> = {
  deals: {
    value: 'amount',
    stage: 'stageId',
    closeDate: 'expectedCloseDate',
    wonAt: 'actualCloseDate',
  },
  contacts: {},
  activities: {},
  leads: {
    score: 'score',
  },
  accounts: {
    annualRevenue: 'annualRevenue',
    healthScore: 'healthScore',
  },
};

function mapField(objectType: ReportQuery['objectType'], field: string): string {
  return FIELD_MAP[objectType]?.[field] ?? field;
}

function mapFilters(objectType: ReportQuery['objectType'], filters: ReportFilter[]) {
  return filters.map((f) => ({
    field: mapField(objectType, f.field),
    operator: f.operator,
    value:
      f.value === undefined || f.value === null
        ? ''
        : Array.isArray(f.value)
          ? f.value.join(',')
          : String(f.value),
  }));
}

function mapColumns(objectType: ReportQuery['objectType'], columns: string[]): string[] {
  return columns.map((c) => mapField(objectType, c));
}

function entityFromObjectType(
  o: ReportQuery['objectType']
): 'deal' | 'lead' | 'activity' | 'account' | 'contact' {
  switch (o) {
    case 'deals':
      return 'deal';
    case 'contacts':
      return 'contact';
    case 'activities':
      return 'activity';
    case 'leads':
      return 'lead';
    case 'accounts':
      return 'account';
    default:
      return 'deal';
  }
}

export type ExecuteReportOptions = {
  authorization?: string;
  /** When set (scheduled jobs), load deals via CRM internal API + token. */
  serviceToken?: string;
};

/**
 * Executes a report against CRM data (same pattern as `executor.service.ts`).
 * Either pass a user `authorization` header, or `serviceToken` + rely on tenant in query path (schedules).
 */
export async function executeReport(
  _prisma: ReportingPrisma,
  tenantId: string,
  query: ReportQuery,
  opts: ExecuteReportOptions = {}
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const limit = Math.min(query.limit ?? 500, 2000);
  const offset = query.offset ?? 0;

  // Route analytics queries to ClickHouse via analytics-service
  if (query.objectType === 'pipeline_analytics' || query.objectType === 'revenue_analytics') {
    return executeAnalyticsReport(tenantId, query, limit, offset);
  }

  const crm = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';

  if (opts.serviceToken && !opts.authorization) {
    return executeReportViaServiceToken(crm, tenantId, query, limit, offset, opts.serviceToken);
  }

  const auth = opts.authorization;
  if (!auth) {
    throw new Error('Missing authorization for report execution');
  }

  const res = await fetch(`${crm}/api/v1/reports/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify({
      querySpec: {
        entity: entityFromObjectType(query.objectType),
        columns: mapColumns(query.objectType, query.columns),
        filters: mapFilters(query.objectType, query.filters),
        groupBy: query.groupBy ? mapField(query.objectType, query.groupBy) : undefined,
        sortBy: query.sortBy ? mapField(query.objectType, query.sortBy) : undefined,
        sortDir: query.sortDir ?? 'desc',
        limit,
        offset,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CRM report query failed: ${res.status} ${err}`);
  }

  const body = (await res.json()) as {
    success?: boolean;
    data?: { columns?: string[]; rows?: Record<string, unknown>[]; total?: number };
  };
  const rows = body.data?.rows ?? [];
  const total = body.data?.total ?? rows.length;
  return { rows, total };
}

const ANALYTICS_TIMEOUT_MS = 4000;

async function executeAnalyticsReport(
  tenantId: string,
  query: ReportQuery,
  limit: number,
  offset: number
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const analyticsUrl = process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008/api/v1/analytics';
  const endpoint = query.objectType === 'pipeline_analytics' ? '/pipeline/summary' : '/revenue/summary';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';

  // Guarded: analytics is a live read model. On timeout/unreachable/non-2xx we
  // degrade to an empty result instead of throwing, so report/dashboard runs
  // keep working when analytics-service is down.
  let raw: Record<string, unknown> | Record<string, unknown>[] | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);
  try {
    const res = await fetch(`${analyticsUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
      signal: controller.signal,
    });
    if (res.ok) {
      const body = (await res.json()) as {
        success?: boolean;
        data?: Record<string, unknown> | Record<string, unknown>[];
      };
      raw = body.data;
    }
  } catch {
    // Timeout / connection error / malformed body → fall through to empty result.
  } finally {
    clearTimeout(timer);
  }

  // A missing/malformed response leaves raw undefined → zero rows, NOT a fake
  // [{}] null row that would report total:1.
  const rows = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const filtered = applyFiltersInMemory(rows, query.filters, query.objectType);
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const projected = slice.map((r) =>
    Object.fromEntries(
      query.columns.map((col) => [col, r[col] ?? r[mapField(query.objectType, col)] ?? null])
    )
  );
  return { rows: projected, total };
}

async function executeReportViaServiceToken(
  crm: string,
  tenantId: string,
  query: ReportQuery,
  limit: number,
  offset: number,
  serviceToken: string
): Promise<{ rows: Record<string, unknown>[]; total: number; degraded?: boolean }> {
  // Scheduled (background) runs have no end-user JWT, so they can only pull from
  // CRM's internal reporting endpoint, which currently exposes deals. For every
  // OTHER dataset we FAIL OPEN — return an empty result flagged `degraded`
  // instead of throwing, so the schedule still delivers and advances its
  // nextRunAt rather than throwing every 60s. (analytics datasets are routed
  // earlier in executeReport.)
  if (query.objectType !== 'deals') {
    return { rows: [], total: 0, degraded: true };
  }

  const u = new URL(`${crm}/api/v1/internal/reporting/deals`);
  u.searchParams.set('limit', String(Math.min(limit + offset + 50, 5000)));

  const res = await fetch(u, {
    headers: {
      'x-service-token': serviceToken,
      'x-tenant-id': tenantId,
    },
  });
  if (!res.ok) throw new Error(`CRM internal deals failed: ${res.status}`);
  const body = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  const raw = (body.data ?? []) as Record<string, unknown>[];
  const filtered = applyFiltersInMemory(raw, query.filters, 'deals');
  const total = filtered.length;
  const slice = filtered.slice(offset, offset + limit);
  const projected = slice.map((r) =>
    Object.fromEntries(
      query.columns.map((col) => [col, r[col] ?? r[mapField('deals', col)] ?? null])
    )
  );
  return { rows: projected, total };
}

function applyFiltersInMemory(
  rows: Record<string, unknown>[],
  filters: ReportFilter[],
  objectType: ReportQuery['objectType']
): Record<string, unknown>[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const field = mapField(objectType, f.field);
      const actual = row[field] ?? row[f.field];
      const val = f.value;
      switch (f.operator) {
        case 'eq':
          return String(actual) === String(val ?? '');
        case 'neq':
          return String(actual) !== String(val ?? '');
        case 'contains':
          return String(actual ?? '').toLowerCase().includes(String(val ?? '').toLowerCase());
        case 'gt':
          return Number(actual) > Number(val);
        case 'lt':
          return Number(actual) < Number(val);
        case 'gte':
          return Number(actual) >= Number(val);
        case 'lte':
          return Number(actual) <= Number(val);
        case 'in':
          return String(val)
            .split(',')
            .map((s) => s.trim())
            .includes(String(actual));
        case 'isNull':
          return actual === null || actual === undefined;
        case 'isNotNull':
          return actual !== null && actual !== undefined;
        default:
          return true;
      }
    })
  );
}

/**
 * Serialize one CSV cell. Neutralizes spreadsheet formula injection by prefixing
 * a single quote to any value that begins with =, +, -, @, tab or CR (the
 * characters Excel/Sheets treat as the start of a formula), then applies
 * standard RFC-4180 quoting for embedded commas/quotes/newlines.
 */
export function csvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function exportToCsv(rows: Record<string, unknown>[], columns: string[]): Promise<string> {
  const header = columns.map((c) => csvCell(c)).join(',');
  const lines = rows.map((row) => columns.map((col) => csvCell(row[col])).join(','));
  return [header, ...lines].join('\n');
}
