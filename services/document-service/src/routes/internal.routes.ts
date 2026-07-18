import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { NexusError, ValidationError } from '@nexus/service-utils';
import { htmlToPdf } from '../services/pdf.service.js';

/**
 * Internal (docker-network-only) HTML→PDF conversion.
 *
 * Rendering a PDF needs a headless Chromium, and this service already ships one.
 * Exposing it here lets other services (e.g. reporting-service's report export)
 * produce real PDFs without baking a second ~300MB browser into their images —
 * one Chromium in the estate rather than one per caller.
 *
 * The shared `createService` bootstrap skips its global JWT preHandler for
 * `/api/v1/internal/*` requests carrying a valid `x-service-token`, so the check
 * below is the authoritative gate.
 */

const HtmlToPdfSchema = z.object({
  // Generous but bounded: a large report still fits well under this, while an
  // unbounded body would let one request pin a browser process indefinitely.
  html: z.string().min(1).max(5_000_000),
  landscape: z.boolean().optional(),
});

/** Strict gate — fail closed when unconfigured. */
function verifyServiceToken(req: FastifyRequest): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) return false;
  return req.headers['x-service-token'] === expected;
}

export async function registerInternalDocumentRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/internal/documents/html-to-pdf', async (request, reply) => {
        if (!verifyServiceToken(request)) {
          throw new NexusError('UNAUTHORIZED', 'invalid service token', 401);
        }
        const parsed = HtmlToPdfSchema.safeParse(request.body ?? {});
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

        // NOTE: callers must pass SELF-CONTAINED html. Chromium will fetch any
        // remote resource the markup references, from inside the private network
        // — so a document with external references would turn this into an SSRF
        // primitive. Every current caller renders its own escaped template with
        // no external refs.
        let pdf: Buffer;
        try {
          pdf = await htmlToPdf(parsed.data.html);
        } catch (err) {
          throw new NexusError('PDF_RENDER_FAILED', (err as Error)?.message ?? 'render failed', 502);
        }
        reply.header('Content-Type', 'application/pdf');
        return reply.send(pdf);
      });
    },
    { prefix: '/api/v1' }
  );
}
