import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { createYoga } from 'graphql-yoga';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';

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
