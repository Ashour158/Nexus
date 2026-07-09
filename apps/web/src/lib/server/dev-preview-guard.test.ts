import { describe, expect, it } from 'vitest';
import { resolveDevPreviewEnabled } from './dev-preview-guard';

describe('DEV_PREVIEW environment guard', () => {
  it('allows preview in local development', () => {
    expect(resolveDevPreviewEnabled({
      NODE_ENV: 'development',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: 'true',
    })).toBe(true);
  });

  it('rejects preview in production', () => {
    expect(() => resolveDevPreviewEnabled({
      NODE_ENV: 'production',
      DEV_PREVIEW_ENABLED: 'true',
    })).toThrow('DEV_PREVIEW_ENABLED is not allowed outside local development.');
  });

  it('rejects preview in staging deployment environments', () => {
    expect(() => resolveDevPreviewEnabled({
      NODE_ENV: 'development',
      DEV_PREVIEW_ENABLED: 'true',
      VERCEL_ENV: 'preview',
      DEPLOYMENT_ENV: 'staging',
    })).toThrow('DEV_PREVIEW_ENABLED is not allowed outside local development.');
  });

  it('allows disabled preview everywhere', () => {
    expect(resolveDevPreviewEnabled({
      NODE_ENV: 'production',
      NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    })).toBe(false);
  });
});
