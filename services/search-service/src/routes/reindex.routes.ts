import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MeiliSearch } from 'meilisearch';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission, checkPermission } from '@nexus/service-utils';
import { addSearchMeta } from '../indexes/doc-meta.js';
import { DEALS_INDEX, dealDocFromPayload } from '../indexes/deals.index.js';
import { CONTACTS_INDEX, contactDocFromPayload } from '../indexes/contacts.index.js';
import { ACCOUNTS_INDEX, accountDocFromPayload } from '../indexes/accounts.index.js';
import { LEADS_INDEX, leadDocFromPayload } from '../indexes/leads.index.js';
import { ACTIVITIES_INDEX, activityDocFromPayload } from '../indexes/activities.index.js';
import { QUOTES_INDEX, quoteDocFromPayload } from '../indexes/quotes.index.js';
import { KB_ARTICLES_INDEX, kbArticleDocFromPayload } from '../indexes/kb-articles.index.js';

// ─── Source configuration ─────────────────────────────────────────────────────
//
// Reindex is a cold-start / disaster-recovery path: it re-hydrates the Meili
// indexes from the owning services' authoritative stores when event-driven
// upserts alone would leave pre-existing records invisible (fresh deploy, Meili
// data loss). Each entity is sourced from its owning service's internal list
// endpoint using the shared service token + x-tenant-id, paged with a hard cap,
// then normalised through the same doc mappers the live indexer uses (so the
// documents are byte-identical whichever path wrote them → idempotent).
//
// The base URLs are read from env and the service is unconfigured-safe: an
// entity whose owning service URL is unset (or whose endpoint is missing / not
// yet deployed) is skipped with a warning rather than failing the whole job.

type ReindexIndex =
  | 'deals'
  | 'contacts'
  | 'accounts'
  | 'leads'
  | 'activities'
  | 'quotes'
  | 'kb_articles';

interface SourceConfig {
  meiliUid: string;
  /** env var holding the owning service base URL. */
  baseUrlEnv: string;
  /** internal list path on the owning service (paged, service-token protected). */
  path: string;
  /** the read permission the owning entity requires (mirrors /search gating). */
  permission: string;
  /** normalise a source record into a Meili document (maps legacy id keys → id). */
  normalize: (payload: Record<string, unknown>) => Record<string, unknown> | null;
}

const SOURCES: Record<ReindexIndex, SourceConfig> = {
  deals: {
    meiliUid: DEALS_INDEX,
    baseUrlEnv: 'CRM_SERVICE_URL',
    path: '/api/v1/internal/search-source/deals',
    permission: PERMISSIONS.DEALS.READ,
    normalize: dealDocFromPayload,
  },
  contacts: {
    meiliUid: CONTACTS_INDEX,
    baseUrlEnv: 'CRM_SERVICE_URL',
    path: '/api/v1/internal/search-source/contacts',
    permission: PERMISSIONS.CONTACTS.READ,
    normalize: contactDocFromPayload,
  },
  accounts: {
    meiliUid: ACCOUNTS_INDEX,
    baseUrlEnv: 'CRM_SERVICE_URL',
    path: '/api/v1/internal/search-source/accounts',
    permission: PERMISSIONS.ACCOUNTS.READ,
    normalize: accountDocFromPayload,
  },
  leads: {
    meiliUid: LEADS_INDEX,
    baseUrlEnv: 'CRM_SERVICE_URL',
    path: '/api/v1/internal/search-source/leads',
    permission: PERMISSIONS.LEADS.READ,
    normalize: leadDocFromPayload,
  },
  activities: {
    meiliUid: ACTIVITIES_INDEX,
    baseUrlEnv: 'CRM_SERVICE_URL',
    path: '/api/v1/internal/search-source/activities',
    permission: PERMISSIONS.ACTIVITIES.READ,
    normalize: activityDocFromPayload,
  },
  quotes: {
    meiliUid: QUOTES_INDEX,
    baseUrlEnv: 'FINANCE_SERVICE_URL',
    path: '/api/v1/internal/search-source/quotes',
    permission: PERMISSIONS.QUOTES.READ,
    normalize: quoteDocFromPayload,
  },
  kb_articles: {
    meiliUid: KB_ARTICLES_INDEX,
    baseUrlEnv: 'KNOWLEDGE_SERVICE_URL',
    path: '/api/v1/internal/search-source/articles',
    permission: PERMISSIONS.SETTINGS.READ,
    normalize: kbArticleDocFromPayload,
  },
};

const ALL_INDEXES = Object.keys(SOURCES) as ReindexIndex[];

// Safety caps. `pageSize` bounds a single source request; `maxPerIndex` bounds
// how many records a single job will pull per index (guards against a runaway
// reindex hammering a source or Meili). `maxPages` is a belt-and-braces stop in
// case a source keeps returning a non-null cursor.
const DEFAULT_PAGE_SIZE = Number(process.env.REINDEX_PAGE_SIZE ?? 500);
const MAX_PAGE_SIZE = 1000;
const DEFAULT_MAX_PER_INDEX = Number(process.env.REINDEX_MAX_PER_INDEX ?? 50_000);

// ─── Job state (in-memory) ────────────────────────────────────────────────────

type JobStatus = 'running' | 'completed' | 'failed';

interface IndexProgress {
  indexed: number;
  pages: number;
  status: 'pending' | 'running' | 'skipped' | 'completed' | 'failed';
  warning?: string;
  error?: string;
}

interface ReindexJob {
  id: string;
  tenantId: string;
  indexes: ReindexIndex[];
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  progress: Record<string, IndexProgress>;
}

// jobId → job, plus a per-tenant "latest job" pointer so status can be polled
// without knowing the id. In-memory only: a reindex is a transient operation and
// job state does not need to survive a restart (the reindex itself is idempotent
// and can simply be re-run).
const JOBS = new Map<string, ReindexJob>();
const LATEST_BY_TENANT = new Map<string, string>();

function tenantHasRunningJob(tenantId: string): boolean {
  for (const job of JOBS.values()) {
    if (job.tenantId === tenantId && job.status === 'running') return true;
  }
  return false;
}

// ─── Source fetching ──────────────────────────────────────────────────────────

interface SourcePage {
  items: Record<string, unknown>[];
  nextCursor: string | null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v));
}

/**
 * Fetch one page from an owning service's internal list endpoint. Tolerant of a
 * few common response envelopes:
 *   { data: { items | records: [...], nextCursor | pageInfo.nextCursor } }
 *   { data: [...] }            (single page, no cursor)
 * Throws on a non-2xx / transport error so the caller can record it as a warning.
 */
async function fetchSourcePage(
  baseUrl: string,
  path: string,
  token: string,
  tenantId: string,
  limit: number,
  cursor: string | null
): Promise<SourcePage> {
  const url = new URL(path, baseUrl);
  url.searchParams.set('tenantId', tenantId);
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString(), {
    headers: { 'x-service-token': token, 'x-tenant-id': tenantId },
  });
  if (!res.ok) {
    throw new Error(`source returned ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const data = (body.data ?? body) as Record<string, unknown> | unknown[];

  let items: Record<string, unknown>[];
  let nextCursor: string | null = null;
  if (Array.isArray(data)) {
    items = asRecordArray(data);
  } else {
    items = asRecordArray(data.items ?? data.records ?? data.results);
    const pageInfo = (data.pageInfo ?? {}) as Record<string, unknown>;
    const rawNext = data.nextCursor ?? pageInfo.nextCursor ?? pageInfo.cursor;
    nextCursor = typeof rawNext === 'string' && rawNext.length > 0 ? rawNext : null;
  }
  return { items, nextCursor };
}

/** Reindex a single entity for one tenant. Never throws; records into `progress`. */
async function reindexOne(
  client: MeiliSearch,
  index: ReindexIndex,
  tenantId: string,
  pageSize: number,
  maxPerIndex: number,
  progress: IndexProgress
): Promise<void> {
  const cfg = SOURCES[index];
  const baseUrl = (process.env[cfg.baseUrlEnv] ?? '').replace(/\/$/, '');
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';

  if (!baseUrl || !token) {
    progress.status = 'skipped';
    progress.warning = !baseUrl
      ? `${cfg.baseUrlEnv} is not configured; source skipped`
      : 'INTERNAL_SERVICE_TOKEN is not configured; source skipped';
    return;
  }

  progress.status = 'running';
  const maxPages = Math.ceil(maxPerIndex / pageSize) + 1;
  let cursor: string | null = null;

  try {
    for (let page = 0; page < maxPages && progress.indexed < maxPerIndex; page += 1) {
      const remaining = maxPerIndex - progress.indexed;
      const limit = Math.min(pageSize, remaining);
      const { items, nextCursor }: SourcePage = await fetchSourcePage(
        baseUrl,
        cfg.path,
        token,
        tenantId,
        limit,
        cursor
      );
      if (items.length === 0) break;

      // Force tenant onto every doc (defence-in-depth) then normalise + enrich.
      const docs = items
        .map((item) => cfg.normalize({ ...item, tenantId }))
        .filter((d): d is Record<string, unknown> => d !== null)
        .map((d) => addSearchMeta(d));

      if (docs.length > 0) {
        await client.index(cfg.meiliUid).addDocuments(docs, { primaryKey: 'id' });
        progress.indexed += docs.length;
      }
      progress.pages += 1;

      cursor = nextCursor;
      if (!cursor) break;
    }
    progress.status = 'completed';
  } catch (err) {
    progress.status = 'failed';
    progress.error = err instanceof Error ? err.message : String(err);
  }
}

async function runReindex(
  client: MeiliSearch,
  job: ReindexJob,
  pageSize: number,
  maxPerIndex: number
): Promise<void> {
  for (const index of job.indexes) {
    // Sequential across indexes to keep source/Meili load bounded.
    // eslint-disable-next-line no-await-in-loop
    await reindexOne(client, index, job.tenantId, pageSize, maxPerIndex, job.progress[index]);
  }
  const allFailed = job.indexes.every((i) => job.progress[i].status === 'failed');
  job.status = allFailed && job.indexes.length > 0 ? 'failed' : 'completed';
  job.finishedAt = new Date().toISOString();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const IndexParamSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : ['all']))
  .pipe(z.array(z.enum(['all', ...ALL_INDEXES] as [string, ...string[]])).min(1));

const ReindexBodySchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  maxPerIndex: z.coerce.number().int().min(1).optional(),
  // Only honoured for a global-wildcard (super-admin) caller; otherwise ignored
  // and forced to the caller's own tenant.
  tenantId: z.string().min(1).optional(),
});

export async function registerReindexRoutes(app: FastifyInstance, client: MeiliSearch): Promise<void> {
  await app.register(
    async (r) => {
      // Admin-gated: reindex reads/writes across every entity in a tenant, so it
      // requires settings:write (the admin/settings capability) rather than any
      // single entity's read permission.
      r.post('/search/reindex', { preHandler: requirePermission(PERMISSIONS.SETTINGS.WRITE) }, async (request, reply) => {
        const indexParsed = IndexParamSchema.safeParse((request.query as { index?: string }).index);
        if (!indexParsed.success) throw new ValidationError('Invalid index', indexParsed.error.flatten());
        const bodyParsed = ReindexBodySchema.safeParse(request.body ?? {});
        if (!bodyParsed.success) throw new ValidationError('Invalid reindex options', bodyParsed.error.flatten());

        const jwt = request.user as JwtPayload;
        const isSuperAdmin = checkPermission(jwt.permissions ?? [], '*');
        // Per-tenant scope: default to the caller's tenant. A cross-tenant scope
        // is only honoured for a global-wildcard caller so a normal admin can
        // never reindex (and thus read) another tenant's records.
        const tenantId = isSuperAdmin && bodyParsed.data.tenantId ? bodyParsed.data.tenantId : jwt.tenantId;

        const selected = indexParsed.data.includes('all')
          ? [...ALL_INDEXES]
          : ([...new Set(indexParsed.data)] as ReindexIndex[]);

        if (tenantHasRunningJob(tenantId)) {
          return reply.status(409).send({
            success: false,
            error: 'REINDEX_IN_PROGRESS',
            message: 'A reindex job is already running for this tenant. Poll GET /search/reindex/status.',
          });
        }

        const pageSize = Math.min(bodyParsed.data.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const maxPerIndex = bodyParsed.data.maxPerIndex ?? DEFAULT_MAX_PER_INDEX;

        const job: ReindexJob = {
          id: randomUUID(),
          tenantId,
          indexes: selected,
          status: 'running',
          startedAt: new Date().toISOString(),
          progress: Object.fromEntries(
            selected.map((i) => [i, { indexed: 0, pages: 0, status: 'pending' } as IndexProgress])
          ),
        };
        JOBS.set(job.id, job);
        LATEST_BY_TENANT.set(tenantId, job.id);

        // Fire-and-forget: the job runs asynchronously and is polled via the
        // status endpoint. Guarded so a fatal error still marks the job failed.
        void runReindex(client, job, pageSize, maxPerIndex).catch((err) => {
          job.status = 'failed';
          job.finishedAt = new Date().toISOString();
          // eslint-disable-next-line no-console
          console.warn('[search-service] reindex job failed:', err instanceof Error ? err.message : err);
        });

        return reply.status(202).send({
          success: true,
          data: {
            jobId: job.id,
            tenantId,
            indexes: selected,
            status: job.status,
            statusUrl: `/api/v1/search/reindex/status?jobId=${job.id}`,
          },
        });
      });

      // Status poll. Scoped to the caller's tenant (a super-admin may pass the
      // tenantId the job was created for). Returns the named job, or the tenant's
      // most recent job when no jobId is supplied.
      r.get('/search/reindex/status', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const isSuperAdmin = checkPermission(jwt.permissions ?? [], '*');
        const { jobId } = request.query as { jobId?: string };

        const job = jobId ? JOBS.get(jobId) : (() => {
          const latest = LATEST_BY_TENANT.get(jwt.tenantId);
          return latest ? JOBS.get(latest) : undefined;
        })();

        if (!job) {
          return reply.status(404).send({ success: false, error: 'NOT_FOUND', message: 'No reindex job found' });
        }
        // Tenant isolation: never expose another tenant's job to a normal admin.
        if (job.tenantId !== jwt.tenantId && !isSuperAdmin) {
          return reply.status(404).send({ success: false, error: 'NOT_FOUND', message: 'No reindex job found' });
        }

        const totalIndexed = Object.values(job.progress).reduce((sum, p) => sum + p.indexed, 0);
        return reply.send({
          success: true,
          data: {
            jobId: job.id,
            tenantId: job.tenantId,
            status: job.status,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt ?? null,
            totalIndexed,
            indexes: job.progress,
          },
        });
      });
    },
    { prefix: '/api/v1' }
  );
}
