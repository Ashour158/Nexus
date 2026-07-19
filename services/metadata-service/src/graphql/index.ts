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
      // Fastify's JSON content-type parser has ALREADY consumed the request
      // stream into `req.body`. Handing Yoga `req.raw` therefore gave it a
      // drained stream, and every GraphQL POST failed with
      // "POST body sent invalid JSON" / "Unexpected end of JSON input" — the
      // real reason field-permissions (and any other GraphQL call into this
      // service) never worked. Pass the parsed body back explicitly instead of
      // re-reading the socket.
      const response = await yoga.handleNodeRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      } as never);
      reply.status(response.status);
      for (const [key, value] of response.headers) {
        void reply.header(key, value);
      }
      return reply.send(response.body);
    },
  });

  fastify.log.info('GraphQL subgraph registered at /graphql');
}
