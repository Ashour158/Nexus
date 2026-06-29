import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerContactsHealthRoutes } from './health.routes.js';

describe('health routes', () => {
  it('GET /health returns healthy status', async () => {
    const app = Fastify();
    registerContactsHealthRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('contacts-service');
  });
});
