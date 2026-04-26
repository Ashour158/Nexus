export interface QuerySpec {
  datasource?: 'crm' | 'analytics' | 'finance';
  endpoint?: string;
  entity?: string;
  columns?: string[];
  filters?: Array<{ field: string; operator: string; value: string }>;
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface ReportResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

function serviceUrl(datasource: string): string {
  if (datasource === 'analytics') return process.env.ANALYTICS_SERVICE_URL ?? 'http://localhost:3008/api/v1/analytics';
  if (datasource === 'finance') return process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003/api/v1';
  return process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
}

export async function executeReport(
  tenantId: string,
  datasource: string,
  querySpec: QuerySpec,
  params: Record<string, unknown> = {}
): Promise<ReportResult> {
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  if (datasource === 'crm') {
    const res = await fetch(`${serviceUrl('crm')}/reports/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenantId, querySpec, params }),
    });
    if (!res.ok) throw new Error('CRM report query failed');
    const body = (await res.json()) as { data?: ReportResult };
    return body.data ?? { columns: querySpec.columns ?? [], rows: [] };
  }
  const endpoint = querySpec.endpoint ?? '';
  const url = new URL(`${serviceUrl(datasource)}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${datasource} report query failed`);
  const body = (await res.json()) as { data?: unknown };
  const data = body.data;
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data as Record<string, unknown>] : [];
  const columns = querySpec.columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return { columns, rows: rows as Record<string, unknown>[] };
}
