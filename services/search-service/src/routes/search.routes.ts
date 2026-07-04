import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MeiliSearch } from 'meilisearch';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { ACCOUNTS_INDEX } from '../indexes/accounts.index.js';
import { CONTACTS_INDEX } from '../indexes/contacts.index.js';
import { DEALS_INDEX } from '../indexes/deals.index.js';
import { LEADS_INDEX } from '../indexes/leads.index.js';
import { ACTIVITIES_INDEX } from '../indexes/activities.index.js';
import { QUOTES_INDEX } from '../indexes/quotes.index.js';
import { KB_ARTICLES_INDEX } from '../indexes/kb-articles.index.js';

// All searchable entity types → their Meilisearch index uid. The four primary
// entities are always part of the default global search; the additional types
// are opt-in via the `type` query parameter (kept additive so existing
// consumers of `/search` see unchanged shape/behavior).
const INDEX_BY_TYPE = {
  deals: DEALS_INDEX,
  contacts: CONTACTS_INDEX,
  accounts: ACCOUNTS_INDEX,
  leads: LEADS_INDEX,
  activities: ACTIVITIES_INDEX,
  quotes: QUOTES_INDEX,
  kb_articles: KB_ARTICLES_INDEX,
} as const;

type SearchType = keyof typeof INDEX_BY_TYPE;

const DEFAULT_TYPES: SearchType[] = ['deals', 'contacts', 'accounts', 'leads'];

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

// Comma-separated `type` filter, e.g. `?type=deals,quotes`. Absent → default
// four primary entities so existing callers are unaffected.
const TypeFilterSchema = z
  .string()
  .optional()
  .transform((raw) => (raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
  .pipe(z.array(z.enum(Object.keys(INDEX_BY_TYPE) as [SearchType, ...SearchType[]])).optional());

export async function registerSearchRoutes(app: FastifyInstance, client: MeiliSearch): Promise<void> {
  await app.register(async (r) => {
    r.get('/search', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const typeParsed = TypeFilterSchema.safeParse((request.query as { type?: string }).type);
      if (!typeParsed.success) throw new ValidationError('Invalid type filter', typeParsed.error.flatten());

      const jwt = request.user as JwtPayload;
      const { q, limit, page } = parsed.data;
      const offset = (page - 1) * limit;
      // Tenant scoping is mandatory on every index query.
      const filter = `tenantId = '${jwt.tenantId}'`;

      const requestedTypes = typeParsed.data;

      // Default request (no `type`): preserve the original four-entity response
      // shape so existing clients keep working.
      if (!requestedTypes) {
        const [deals, contacts, accounts, leads] = await Promise.all([
          client.index(DEALS_INDEX).search(q, { filter, limit, offset }),
          client.index(CONTACTS_INDEX).search(q, { filter, limit, offset }),
          client.index(ACCOUNTS_INDEX).search(q, { filter, limit, offset }),
          client.index(LEADS_INDEX).search(q, { filter, limit, offset }),
        ]);
        return reply.send({
          success: true,
          data: {
            deals: deals.hits,
            contacts: contacts.hits,
            accounts: accounts.hits,
            leads: leads.hits,
            total:
              deals.estimatedTotalHits +
              contacts.estimatedTotalHits +
              accounts.estimatedTotalHits +
              leads.estimatedTotalHits,
          },
        });
      }

      // Explicit `type` filter: search only the requested indexes and return a
      // keyed map (still tenant-scoped per index).
      const types = requestedTypes.length ? requestedTypes : DEFAULT_TYPES;
      const results = await Promise.all(
        types.map((type) => client.index(INDEX_BY_TYPE[type]).search(q, { filter, limit, offset }))
      );

      const data: Record<string, unknown> = {};
      let total = 0;
      types.forEach((type, i) => {
        data[type] = results[i].hits;
        total += results[i].estimatedTotalHits;
      });
      data.total = total;
      return reply.send({ success: true, data });
    });

    r.get('/search/deals', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(DEALS_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });

    r.get('/search/contacts', { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(CONTACTS_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });

    r.get('/search/accounts', { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(ACCOUNTS_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });

    r.get('/search/activities', { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(ACTIVITIES_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });

    r.get('/search/quotes', { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(QUOTES_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });

    // Knowledge-base search. Uses SETTINGS.READ to mirror knowledge-service's
    // own permission model for KB content.
    r.get('/search/kb', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(KB_ARTICLES_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
      });
      return reply.send({ success: true, data: result.hits });
    });
  }, { prefix: '/api/v1' });
}
