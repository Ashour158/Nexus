import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes, checkRedis } from '@nexus/service-utils';

export function registerRealtimeHealthRoutes(app: FastifyInstance, redis: any): void {
  registerHealthRoutes(app, 'realtime-service', [() => checkRedis(redis)]);
}
