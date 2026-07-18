import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { getVersionInfo, registerVersionRoute } from '../health.js';

const originalGitSha = process.env.GIT_SHA;
const originalBuiltAt = process.env.BUILT_AT;

afterEach(() => {
  if (originalGitSha === undefined) delete process.env.GIT_SHA;
  else process.env.GIT_SHA = originalGitSha;

  if (originalBuiltAt === undefined) delete process.env.BUILT_AT;
  else process.env.BUILT_AT = originalBuiltAt;
});

describe('release version metadata', () => {
  it('returns immutable release metadata from the environment', () => {
    process.env.GIT_SHA = 'abc123';
    process.env.BUILT_AT = '2026-07-18T20:00:00Z';

    expect(getVersionInfo('crm-service')).toEqual({
      service: 'crm-service',
      gitSha: 'abc123',
      builtAt: '2026-07-18T20:00:00Z',
    });
  });

  it('registers GET /version without authentication', async () => {
    process.env.GIT_SHA = 'def456';
    process.env.BUILT_AT = '2026-07-18T21:00:00Z';
    const app = Fastify();
    registerVersionRoute(app, 'test-service');

    const response = await app.inject({ method: 'GET', url: '/version' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      service: 'test-service',
      gitSha: 'def456',
      builtAt: '2026-07-18T21:00:00Z',
    });
    await app.close();
  });
});
