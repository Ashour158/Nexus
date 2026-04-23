import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MeiliSearch } from 'meilisearch';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { ACCOUNTS_INDEX } from '../indexes/accounts.index.js';
import { CONTACTS_INDEX } from '../indexes/contacts.index.js';
import { DEALS_INDEX } from '../indexes/deals.index.js';
import { LEADS_INDEX } from '../indexes/leads.index.js';

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerSearchRoutes(app: FastifyInstance, client: MeiliSearch): Promise<void> {
  await app.register(async (r) => {
    r.get('/search', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const { q, limit, offset } = parsed.data;
      const filter = `tenantId = '${jwt.tenantId}'`;
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
          total: deals.estimatedTotalHits + contacts.estimatedTotalHits + accounts.estimatedTotalHits + leads.estimatedTotalHits,
        },
      });
    });

    r.get('/search/deals', { preHandler: requirePermission(PERMISSIONS.DEALS.READ) }, async (request, reply) => {
      const parsed = SearchQuerySchema.safeParse(request.query);
      if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
      const jwt = request.user as JwtPayload;
      const result = await client.index(DEALS_INDEX).search(parsed.data.q, {
        filter: `tenantId = '${jwt.tenantId}'`,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
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
        offset: parsed.data.offset,
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
        offset: parsed.data.offset,
      });
      return reply.send({ success: true, data: result.hits });
    });
  }, { prefix: '/api/v1' });
}
