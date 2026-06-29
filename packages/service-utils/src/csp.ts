import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';

export const cspHeader = Object.entries({
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob: https:",
  'font-src': "'self'",
  'connect-src': "'self' https:",
  'frame-ancestors': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'upgrade-insecure-requests': '',
})
  .map(([key, val]) => (val ? `${key} ${val}` : key))
  .join('; ');

export const cspPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('onSend', async (_req, reply, _payload) => {
    reply.header('Content-Security-Policy', cspHeader);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  });
};
