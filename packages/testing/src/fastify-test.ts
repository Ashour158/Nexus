import type { FastifyInstance } from 'fastify';
import supertest from 'supertest';

/**
 * Builds a Fastify app for integration tests, disables logging,
 * and returns a supertest agent.
 */
export async function buildTestApp(
  createApp: () => FastifyInstance | Promise<FastifyInstance>
): Promise<supertest.Agent> {
  const app = await createApp();
  app.log.level = 'silent';
  await app.ready();
  return supertest.agent(app.server);
}

/**
 * Returns an Authorization header object for the given Bearer token.
 */
export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
