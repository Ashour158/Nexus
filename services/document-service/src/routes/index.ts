import type { FastifyInstance } from 'fastify';
import { registerDocumentsRoutes } from './documents.routes.js';

// Structural type matching the (tenant-extended) Prisma client's document APIs
// used by the routes. Kept `any`-tolerant at the call site in index.ts.
type RoutesPrisma = Parameters<typeof registerDocumentsRoutes>[1];

export async function registerRoutes(app: FastifyInstance, prisma?: RoutesPrisma): Promise<void> {
  await registerDocumentsRoutes(app, prisma);
}
