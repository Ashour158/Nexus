import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const TOKEN_LENGTH = 32;
const COOKIE_NAME = 'csrf_token';
const HEADER_NAME = 'x-csrf-token';

function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('base64url');
}

export async function registerCsrfPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const existing = (req as unknown as { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    if (!existing) {
      const token = generateToken();
      (reply as unknown as { setCookie: (name: string, value: string, opts: Record<string, unknown>) => void }).setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 86400,
      });
      (reply as unknown as { setCookie: (name: string, value: string, opts: Record<string, unknown>) => void }).setCookie('csrf_token_client', token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 86400,
      });
    }
  });

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const method = req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    const publicPaths = ['/auth/login', '/auth/register', '/auth/saml/callback', '/health', '/ready'];
    if (publicPaths.some((p) => req.url.startsWith(p))) return;

    const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    const headerToken = req.headers[HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      reply.status(403).send({
        success: false,
        error: { code: 'CSRF_INVALID', message: 'CSRF token mismatch. Refresh the page and try again.' },
      });
      return reply;
    }
  });
}

export { COOKIE_NAME as CSRF_COOKIE_NAME, HEADER_NAME as CSRF_HEADER_NAME };
