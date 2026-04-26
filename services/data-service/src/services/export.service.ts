import { stringify } from 'csv-stringify/sync';
import type { DataPrisma } from '../prisma.js';

interface CrmListResponse {
  data?: Record<string, unknown>[];
  hasNextPage?: boolean;
  page?: number;
  totalPages?: number;
}

function authHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  return { Authorization: `Bearer ${token}` };
}

export function createExportService(_prisma: DataPrisma) {
  return {
    async exportCsv(
      _tenantId: string,
      module: string,
      filters: Record<string, unknown> | undefined,
      columns: string[] | undefined
    ) {
      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
      const pageSize = 500;
      let page = 1;
      let hasMore = true;
      const rows: Record<string, unknown>[] = [];

      while (hasMore) {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        for (const [k, v] of Object.entries(filters ?? {})) {
          if (v === undefined || v === null) continue;
          params.set(k, String(v));
        }

        const res = await fetch(
          `${crmUrl}/api/v1/${module}?${params.toString()}`,
          { headers: authHeaders() }
        );
        if (!res.ok) {
          throw new Error(`CRM export fetch failed for module ${module}`);
        }
        const body = (await res.json()) as CrmListResponse;
        const pageRows = Array.isArray(body.data) ? body.data : [];
        rows.push(...pageRows);
        if (body.hasNextPage === true) {
          page += 1;
          continue;
        }
        if (typeof body.totalPages === 'number' && typeof body.page === 'number') {
          hasMore = body.page < body.totalPages;
          page += 1;
        } else {
          hasMore = false;
        }
      }

      const selectedColumns =
        columns && columns.length > 0
          ? columns
          : Array.from(
              rows.reduce((acc, row) => {
                for (const key of Object.keys(row)) acc.add(key);
                return acc;
              }, new Set<string>())
            );

      const records = rows.map((row) => {
        const out: Record<string, string> = {};
        for (const col of selectedColumns) {
          const value = row[col];
          out[col] =
            value === null || value === undefined
              ? ''
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value);
        }
        return out;
      });

      return stringify(records, { header: true, columns: selectedColumns });
    },
  };
}
