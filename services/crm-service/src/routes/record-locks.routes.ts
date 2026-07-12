import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import { getActiveLock, callerMayBypassLock } from '../lib/record-lock.js';
import { loadRecordForAccess, type SharingModule } from '../lib/sharing.js';

const LockParams = z.object({
  module: z.enum(['account', 'contact', 'deal', 'lead']),
  recordId: z.string().cuid(),
});
const LockBody = z.object({ reason: z.string().max(500).optional() });

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);
function isAdmin(jwt: JwtPayload): boolean {
  return (jwt.roles ?? []).some((r) => ADMIN_ROLES.has(r));
}

/**
 * `/api/v1/records/:module/:recordId/lock` — record locking (Zoho "record
 * locking"). Locking or unlocking is restricted to an ADMIN/SUPER_ADMIN or the
 * record OWNER. Enforcement of an active lock on the write path lives in
 * {@link lockBlockingWrite} (lib/record-lock.ts), wired into the accounts /
 * contacts / deals PATCH handlers (returns HTTP 423 when blocked).
 */
export async function registerRecordLocksRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      // ─── GET current lock ───────────────────────────────────────────────
      r.get('/records/:module/:recordId/lock', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { module, recordId } = LockParams.parse(request.params);
        const record = await loadRecordForAccess(prisma, jwt.tenantId, module as SharingModule, recordId);
        if (!record) {
          return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id } });
        }
        const lock = await getActiveLock(prisma, jwt.tenantId, module, recordId);
        return reply.send({ success: true, data: { locked: Boolean(lock), lock } });
      });

      // ─── LOCK ───────────────────────────────────────────────────────────
      r.post('/records/:module/:recordId/lock', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { module, recordId } = LockParams.parse(request.params);
        const parsed = LockBody.safeParse(request.body ?? {});
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

        const record = await loadRecordForAccess(prisma, jwt.tenantId, module as SharingModule, recordId);
        if (!record) {
          return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id } });
        }
        // Only admin or the record owner may lock.
        if (!isAdmin(jwt) && record.ownerId !== jwt.sub) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only an admin or the record owner may lock this record', requestId: request.id } });
        }

        const existing = await getActiveLock(prisma, jwt.tenantId, module, recordId);
        if (existing) {
          // Idempotent: already locked → return the current lock.
          return reply.code(200).send({ success: true, data: existing });
        }
        const lock = await prisma.recordLock.create({
          data: { tenantId: jwt.tenantId, module, recordId, reason: parsed.data.reason ?? null, lockedBy: jwt.sub },
        });
        return reply.code(201).send({ success: true, data: lock });
      });

      // ─── UNLOCK ─────────────────────────────────────────────────────────
      r.post('/records/:module/:recordId/unlock', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { module, recordId } = LockParams.parse(request.params);

        const lock = await getActiveLock(prisma, jwt.tenantId, module, recordId);
        if (!lock) {
          return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'No active lock on this record', requestId: request.id } });
        }
        // Only admin or the user who placed the lock may unlock.
        if (!callerMayBypassLock(lock, jwt)) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Only an admin or the lock owner may unlock this record', requestId: request.id } });
        }
        const updated = await prisma.recordLock.update({ where: { id: lock.id }, data: { unlockedAt: new Date() } });
        return reply.send({ success: true, data: updated });
      });
    },
    { prefix: '/api/v1' }
  );
}
