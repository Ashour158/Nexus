import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { IdParamSchema } from '@nexus/validation';
import type { QuotesPrisma } from '../prisma.js';
import {
  evaluateTransition,
  timestampFieldFor,
  eventTypeFor,
  buildEventPayload,
  type QuoteTransition,
} from '../services/quote-lifecycle.js';
import { emitQuoteEvent, emitAcceptanceHandoff } from '../services/quote-events.js';

/**
 * Guarded quote-lifecycle transition endpoints (additive).
 *
 * These are NOT the deprecated generic quote mutations (create / patch / delete
 * still 410 → finance-service). They are the customer-facing lifecycle arcs
 * (send / view / accept / reject / expire / revise) evaluated against the
 * {@link evaluateTransition} state machine. Illegal transitions are rejected
 * with 409 and never mutate. Timestamps are stamped and an intent-typed event
 * is emitted (fire-and-forget) so downstream analytics / crm / deals / billing
 * consumers stay in sync.
 */

const TRANSITION_PERMISSION: Record<QuoteTransition, string> = {
  send: PERMISSIONS.QUOTES.SEND,
  view: PERMISSIONS.QUOTES.READ,
  accept: PERMISSIONS.QUOTES.UPDATE,
  reject: PERMISSIONS.QUOTES.UPDATE,
  expire: PERMISSIONS.QUOTES.UPDATE,
  revise: PERMISSIONS.QUOTES.UPDATE,
};

function registerTransition(
  r: FastifyInstance,
  prisma: QuotesPrisma,
  transition: QuoteTransition,
  path: string
): void {
  r.post(
    path,
    { preHandler: requirePermission(TRANSITION_PERMISSION[transition]) },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const jwt = request.user as JwtPayload;

      const quote = await prisma.quote.findFirst({
        where: { id, tenantId: jwt.tenantId, deletedAt: null },
      });
      if (!quote) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Quote not found', requestId: request.id },
        });
      }

      const evaluated = evaluateTransition(quote.status, transition);
      if (!evaluated.ok || !evaluated.to) {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'ILLEGAL_TRANSITION',
            message: evaluated.reason ?? 'Illegal transition',
            requestId: request.id,
          },
        });
      }

      const now = new Date();
      const data: Record<string, unknown> = {
        status: evaluated.to,
        version: { increment: 1 },
      };
      const tsField = timestampFieldFor(transition);
      if (tsField) data[tsField] = now;
      if (transition === 'reject') {
        const body = (request.body ?? {}) as { reason?: unknown };
        if (typeof body.reason === 'string' && body.reason.length > 0) {
          data.rejectionReason = body.reason.slice(0, 1000);
        }
      }

      let updated;
      try {
        updated = await prisma.quote.update({ where: { id }, data: data as any });
      } catch (err) {
        request.log.warn({ err, id, transition }, 'quote transition update failed');
        return reply.code(500).send({
          success: false,
          error: { code: 'TRANSITION_FAILED', message: 'Transition could not be applied', requestId: request.id },
        });
      }

      // Fire-and-forget event emission — never block or fail the response.
      const payload = buildEventPayload(updated);
      if (transition === 'accept') {
        void emitAcceptanceHandoff(jwt.tenantId, payload, { correlationId: request.id });
      } else {
        void emitQuoteEvent(eventTypeFor(transition), jwt.tenantId, payload, {
          correlationId: request.id,
        });
      }

      return reply.send({ success: true, data: updated });
    }
  );
}

/**
 * Adds the lifecycle transition routes onto an *already-encapsulated* Fastify
 * instance (i.e. one already scoped under the `/api/v1` prefix). Registering
 * onto the passed instance rather than issuing a fresh `app.register` avoids a
 * second post-boot root registration.
 */
export function registerQuoteLifecycleHandlers(
  r: FastifyInstance,
  prisma: QuotesPrisma
): void {
  registerTransition(r, prisma, 'send', '/quotes/:id/send');
  registerTransition(r, prisma, 'view', '/quotes/:id/view');
  registerTransition(r, prisma, 'accept', '/quotes/:id/accept');
  registerTransition(r, prisma, 'reject', '/quotes/:id/reject');
  registerTransition(r, prisma, 'expire', '/quotes/:id/expire');
  registerTransition(r, prisma, 'revise', '/quotes/:id/revise');
}
