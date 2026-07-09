import type { DataPrisma } from '../prisma.js';
import { serializeCsv } from '../lib/csv.js';

// Generic list-response envelope. Source services are inconsistent: some return
// the array at the top level (`data`), some nest it (`data.data`, `data.rows`,
// `data.items`), and pagination metadata sits either at the top level or inside
// the `data`/`pagination` container. extractRows/pageMeta normalise all of them.
type AnyBody = Record<string, unknown> & {
  data?: unknown;
  rows?: unknown;
  items?: unknown;
  pagination?: unknown;
};

function authHeaders(authToken: string | undefined): Record<string, string> {
  // Export runs on behalf of the requesting user against each source service's
  // end-user-gated list routes, so forward the caller's JWT (they hold
  // <module>:read). Fall back to the service token only if no caller auth given.
  if (authToken && authToken.trim()) {
    return { Authorization: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}` };
  }
  return { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` };
}

// ── Module → source-service routing ────────────────────────────────────────
// Each module's list data lives on a different microservice. `path` is the
// endpoint segment after `/api/v1/` (usually equal to the module key, but a few
// diverge, e.g. knowledge → knowledge/articles).
interface ModuleRoute {
  baseUrl: () => string;
  path: string;
}

const crmUrl = () => process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
const financeUrl = () => process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
const ticketUrl = () => process.env.TICKET_SERVICE_URL ?? 'http://localhost:3029';
const campaignUrl = () => process.env.CAMPAIGN_SERVICE_URL ?? 'http://localhost:3025';
const knowledgeUrl = () => process.env.KNOWLEDGE_SERVICE_URL ?? 'http://localhost:3023';

const MODULE_ROUTES: Record<string, ModuleRoute> = {
  // CRM service (3001)
  leads: { baseUrl: crmUrl, path: 'leads' },
  contacts: { baseUrl: crmUrl, path: 'contacts' },
  accounts: { baseUrl: crmUrl, path: 'accounts' },
  deals: { baseUrl: crmUrl, path: 'deals' },
  activities: { baseUrl: crmUrl, path: 'activities' },
  tasks: { baseUrl: crmUrl, path: 'tasks' },
  notes: { baseUrl: crmUrl, path: 'notes' },
  // Finance service (3002)
  quotes: { baseUrl: financeUrl, path: 'quotes' },
  rfqs: { baseUrl: financeUrl, path: 'rfqs' },
  invoices: { baseUrl: financeUrl, path: 'invoices' },
  orders: { baseUrl: financeUrl, path: 'orders' },
  products: { baseUrl: financeUrl, path: 'products' },
  contracts: { baseUrl: financeUrl, path: 'contracts' },
  // Ticket service (3029)
  tickets: { baseUrl: ticketUrl, path: 'tickets' },
  // Campaign service (3025)
  campaigns: { baseUrl: campaignUrl, path: 'campaigns' },
  // Knowledge service (3023) — list lives under /knowledge/articles
  knowledge: { baseUrl: knowledgeUrl, path: 'knowledge/articles' },
};

function resolveRoute(module: string): ModuleRoute {
  // Default: assume the module key maps 1:1 to a CRM list endpoint. Keeps the
  // service additive/forgiving for CRM modules not yet enumerated above.
  return MODULE_ROUTES[module] ?? { baseUrl: crmUrl, path: module };
}

/** Pull the first array we can find, tolerating every known envelope shape. */
function extractRows(body: AnyBody): Record<string, unknown>[] {
  const d = body?.data as AnyBody | unknown[] | undefined;
  const candidates: unknown[] = [
    body?.data,
    (d as AnyBody | undefined)?.data,
    (d as AnyBody | undefined)?.rows,
    (d as AnyBody | undefined)?.items,
    body?.rows,
    body?.items,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
  }
  return [];
}

interface PageMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
}

/** Locate pagination metadata wherever the source service placed it. */
function pageMeta(body: AnyBody): PageMeta {
  const containers = [
    (body?.data as AnyBody | undefined)?.pagination,
    body?.pagination,
    body?.data,
    body,
  ];
  const meta: PageMeta = {};
  const keys = ['page', 'limit', 'total', 'totalPages', 'hasNextPage'] as const;
  for (const c of containers) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const obj = c as Record<string, unknown>;
    for (const k of keys) {
      if (meta[k] === undefined && typeof obj[k] !== 'undefined') {
        (meta as Record<string, unknown>)[k] = obj[k];
      }
    }
  }
  return meta;
}

export function createExportService(_prisma: DataPrisma) {
  return {
    async exportCsv(
      _tenantId: string,
      module: string,
      filters: Record<string, unknown> | undefined,
      columns: string[] | undefined,
      authToken?: string
    ) {
      const route = resolveRoute(module);
      const base = route.baseUrl();
      // List endpoints commonly cap `limit` (crm: >100 → 422), so page at 100.
      const pageSize = 100;
      const maxPages = 1000; // safety cap → ≤100k rows, prevents runaway loops
      let page = 1;
      let hasMore = true;
      const rows: Record<string, unknown>[] = [];

      while (hasMore && page <= maxPages) {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        for (const [k, v] of Object.entries(filters ?? {})) {
          // Skip empty / sentinel filters — an empty string or 'ALL' forwarded to
          // a source service's `.enum().optional()` query schema would 422.
          if (v === undefined || v === null || v === '' || v === 'ALL') continue;
          params.set(k, String(v));
        }

        const res = await fetch(`${base}/api/v1/${route.path}?${params.toString()}`, {
          headers: authHeaders(authToken),
        });
        if (!res.ok) {
          throw new Error(`Export fetch failed for module ${module} (status ${res.status})`);
        }
        const body = (await res.json()) as AnyBody;
        const pageRows = extractRows(body);
        rows.push(...pageRows);

        // Decide whether another page exists, tolerating varied pagination:
        // explicit flag → totalPages → total/limit math → else single page.
        const meta = pageMeta(body);
        if (typeof meta.hasNextPage === 'boolean') {
          hasMore = meta.hasNextPage;
        } else if (typeof meta.totalPages === 'number' && typeof meta.page === 'number') {
          hasMore = meta.page < meta.totalPages;
        } else if (typeof meta.total === 'number') {
          const limit = typeof meta.limit === 'number' ? meta.limit : pageSize;
          hasMore = page * limit < meta.total;
        } else {
          hasMore = false; // unpaginated endpoint returned the full array
        }
        // Guard: if the endpoint ignored paging and returned < a full page, stop.
        if (pageRows.length < pageSize) hasMore = false;
        page += 1;
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

      // serializeCsv handles null/undefined/object coercion and CSV escaping.
      return serializeCsv(rows, selectedColumns);
    },
  };
}
