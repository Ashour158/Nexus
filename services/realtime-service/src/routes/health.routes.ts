import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from '@nexus/service-utils';

export function registerRealtimeHealthRoutes(app: FastifyInstance): void {
  registerHealthRoutes(app, 'realtime-service', []);
}
