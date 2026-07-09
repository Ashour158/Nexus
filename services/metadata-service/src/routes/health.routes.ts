import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import type { MetadataPrisma } from '../prisma.js';

export function registerMetadataHealthRoutes(app: FastifyInstance, prisma?: MetadataPrisma): void {
  const checks = prisma ? [() => checkDatabase(prisma)] : [];
  registerHealthRoutes(app, 'metadata-service', checks);
}
