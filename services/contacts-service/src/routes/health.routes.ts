import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import type { ContactsPrisma } from '../prisma.js';

export function registerContactsHealthRoutes(app: FastifyInstance, prisma?: ContactsPrisma): void {
  const checks = prisma ? [() => checkDatabase(prisma)] : [];
  registerHealthRoutes(app, 'contacts-service', checks);
}
