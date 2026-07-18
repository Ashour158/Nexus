/**
 * Fastify-aware portal-session guards, shared by every portal-facing route file.
 *
 * A portal request authenticates with a portal SESSION bearer token (issued by
 * `signPortalSession`, deliberately distinct from the end-user JWT). These
 * helpers extract + verify it. Kept separate from `portal-auth.ts` (pure crypto,
 * no Fastify dependency) so the crypto stays framework-agnostic.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyPortalSession, type PortalSession } from './portal-auth.js';

/** Read + verify the portal session bearer token; null when missing/invalid. */
export function readPortalSession(request: FastifyRequest): PortalSession | null {
  const auth = request.headers['authorization'];
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return verifyPortalSession(auth.slice('Bearer '.length).trim());
}

/**
 * Require a valid portal session or short-circuit with 401. Returns the session
 * on success, or null after having sent the 401 (caller must `return` on null).
 */
export function requirePortalSession(
  request: FastifyRequest,
  reply: FastifyReply
): PortalSession | null {
  const session = readPortalSession(request);
  if (!session) {
    reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired portal session', requestId: request.id },
    });
    return null;
  }
  return session;
}
