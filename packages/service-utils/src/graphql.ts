import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { createYoga } from 'graphql-yoga';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { GraphQLError, parse } from 'graphql';
import { checkPermission } from './rbac.js';

/**
 * Minimal shape a GraphQL context must expose for the auth guards below. Both the
 * verified `userId` and the resolved `permissions` come from a cryptographically
 * verified JWT (see `verifyBearerToken`); an unauthenticated request has a null
 * `userId` and empty `permissions`.
 */
export interface AuthGraphQLContext {
  userId: string | null;
  permissions?: string[];
  roles?: string[];
}

/**
 * Throw a GraphQL `UNAUTHENTICATED` error unless the context carries a verified
 * user. Use as the minimum gate on read queries.
 */
export function requireGqlAuth(ctx: AuthGraphQLContext): void {
  if (!ctx.userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED', status: 401 },
    });
  }
}

/**
 * Throw a GraphQL auth error unless the verified user holds `permission`.
 * Reuses the REST permission catalog via {@link checkPermission}, so GraphQL and
 * REST enforce identical permission strings and scope semantics.
 */
export function requireGqlPermission(ctx: AuthGraphQLContext, permission: string): void {
  requireGqlAuth(ctx);
  if (!checkPermission(ctx.permissions ?? [], permission)) {
    throw new GraphQLError(`Permission required: ${permission}`, {
      extensions: { code: 'FORBIDDEN', status: 403, permission },
    });
  }
}

export interface GraphQLSubgraphConfig {
  schemaPath: string;
  resolvers: Record<string, unknown>;
  contextFactory?: (ctx: { req: any; reply: any }) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export async function registerGraphQLSubgraph(
  fastify: FastifyInstance,
  config: GraphQLSubgraphConfig
) {
  const typeDefs = readFileSync(config.schemaPath, 'utf-8');
  const schema = buildSubgraphSchema([{ typeDefs: parse(typeDefs), resolvers: config.resolvers as any }]);

  const yoga = createYoga({
    schema,
    context: config.contextFactory,
    logging: false,
    graphqlEndpoint: '/graphql',
    maskedErrors: { maskError(error) { return error as Error; } },
  });

  fastify.route({
    url: '/graphql',
    method: ['POST', 'GET', 'OPTIONS'],
    handler: async (req, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(req.raw, reply.raw, { req, reply });
      reply.status(response.status);
      for (const [key, value] of response.headers) {
        void reply.header(key, value);
      }
      return reply.send(response.body);
    },
  });

  fastify.log.info('GraphQL subgraph registered at /graphql');
}
