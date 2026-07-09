import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import type { ActivitiesPrisma } from '../prisma.js';

export function registerActivitiesHealthRoutes(app: FastifyInstance, prisma?: ActivitiesPrisma): void {
  const checks = prisma ? [() => checkDatabase(prisma)] : [];
  registerHealthRoutes(app, 'activities-service', checks);
}
