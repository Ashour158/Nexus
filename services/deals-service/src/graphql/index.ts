import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createYoga } from 'graphql-yoga';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parse } from 'graphql';
import { resolvers } from './resolvers.js';
import { buildContext } from './context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(join(__dirname, 'schema.graphql'), 'utf-8');

export function registerGraphQL(fastify: FastifyInstance, prisma: any) {
  const schema = buildSubgraphSchema([{ typeDefs: parse(typeDefs), resolvers: resolvers as any }]);

  const yoga = createYoga({
    schema,
    context: buildContext(prisma),
    logging: false,
    graphqlEndpoint: '/graphql',
    maskedErrors: {
      maskError(error) {
        return error as Error;
      },
    },
  });

  fastify.route({
    url: '/graphql',
    method: ['POST', 'GET', 'OPTIONS'],
    handler: async (req, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(req.raw, reply.raw);
      reply.status(response.status);
      for (const [key, value] of response.headers) {
        void reply.header(key, value);
      }
      return reply.send(response.body);
    },
  });

  fastify.log.info('GraphQL subgraph registered at /graphql');
}
