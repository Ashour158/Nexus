import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { CommPrisma } from '../prisma.js';
import type { TelephonyChannel } from '../channels/telephony.channel.js';

/**
 * CTI telephony routes — click-to-call + automatic call logging (Zoho PhoneBridge equivalent).
 *
 * Additive, permission-guarded, tenant-scoped, fail-open. When telephony is not
 * configured the click-to-call endpoint returns 503 with `requiresConfig`, never
 * throwing. The provider status webhook is signature-verified (Twilio
 * X-Twilio-Signature) and, on call completion, emits a `call.logged` event on
 * TOPICS.CALLS plus an `activity.created` (type CALL) event on TOPICS.ACTIVITIES
 * so crm-service / activities / the customer-journey timeline record the call.
 */

/** Map a Twilio CallStatus to our CallLog status. */
function mapTwilioStatus(twilioStatus: string | undefined): string {
  switch ((twilioStatus ?? '').toLowerCase()) {
    case 'queued':
    case 'initiated':
      return 'INITIATED';
    case 'ringing':
      return 'RINGING';
    case 'in-progress':
      return 'IN_PROGRESS';
    case 'completed':
      return 'COMPLETED';
    case 'busy':
      return 'BUSY';
    case 'no-answer':
      return 'NO_ANSWER';
    case 'canceled':
      return 'CANCELED';
    case 'failed':
      return 'FAILED';
    default:
      return (twilioStatus ?? 'UNKNOWN').toUpperCase();
  }
}

/** Human call outcome derived from a terminal Twilio status. */
function outcomeFor(status: string): string | undefined {
  switch (status) {
    case 'COMPLETED':
      return 'CONNECTED';
    case 'BUSY':
      return 'BUSY';
    case 'NO_ANSWER':
      return 'NO_ANSWER';
    case 'FAILED':
    case 'CANCELED':
      return 'NOT_CONNECTED';
    default:
      return undefined;
  }
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'BUSY', 'NO_ANSWER', 'CANCELED', 'FAILED']);

export async function registerTelephonyRoutes(
  app: FastifyInstance,
  prisma: CommPrisma,
  telephony: TelephonyChannel,
  producer: NexusProducer | null
): Promise<void> {
  // ── Click-to-call ────────────────────────────────────────────────────────
  app.post(
    '/api/v1/telephony/click-to-call',
    { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.CREATE) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const tenantId = jwt.tenantId ?? 'default';
      const agentUserId = jwt.sub ?? 'system';
      const body = (req.body ?? {}) as {
        toNumber?: string;
        contactId?: string;
        dealId?: string;
        accountId?: string;
      };

      if (!body.toNumber || typeof body.toNumber !== 'string') {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'toNumber is required', requestId: req.id },
        });
      }

      if (!telephony.isConfigured()) {
        return reply.code(503).send({
          success: false,
          error: 'Telephony (CTI) not configured',
          requiresConfig: true,
          hint: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_CALLER_ID in comm-service environment',
        });
      }

      const entityType = body.dealId ? 'DEAL' : body.accountId ? 'ACCOUNT' : body.contactId ? 'CONTACT' : undefined;
      const entityId = body.dealId ?? body.accountId ?? body.contactId;

      const result = await telephony.initiateCall({
        tenantId,
        agentUserId,
        toNumber: body.toNumber,
        entityType,
        entityId,
      });

      if (!result.ok) {
        const code = result.reason === 'not_configured' ? 503 : 502;
        return reply.code(code).send({
          success: false,
          error: result.message,
          requiresConfig: result.reason === 'not_configured',
        });
      }

      const call = await prisma.callLog.create({
        data: {
          tenantId,
          provider: result.provider,
          providerCallSid: result.callSid || null,
          direction: 'OUTBOUND',
          fromNumber: result.fromNumber,
          toNumber: result.toNumber,
          agentUserId,
          contactId: body.contactId ?? null,
          dealId: body.dealId ?? null,
          accountId: body.accountId ?? null,
          status: 'INITIATED',
        },
      });

      return reply.send({
        success: true,
        data: { callId: call.id, callSid: result.callSid, status: call.status },
      });
    }
  );

  // ── Provider status callback (Twilio) ────────────────────────────────────
  // Public webhook: verified by X-Twilio-Signature (no JWT). Body is
  // application/x-www-form-urlencoded per Twilio. Registered inside an
  // encapsulated plugin so the urlencoded content-type parser is scoped to this
  // route only (no @fastify/formbody dependency — uses built-in URLSearchParams).
  await app.register(async (webhook) => {
    webhook.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          const parsed: Record<string, string> = {};
          for (const [k, v] of new URLSearchParams(body as string)) parsed[k] = v;
          done(null, parsed);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

    webhook.post('/api/v1/telephony/webhook', async (req, reply) => {
    const params = (req.body ?? {}) as Record<string, string>;
    const signature = req.headers['x-twilio-signature'] as string | undefined;

    // Reconstruct the exact URL Twilio signed (honour proxy headers).
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol;
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
    const fullUrl =
      process.env.TELEPHONY_STATUS_CALLBACK_URL?.trim() || `${proto}://${host}${req.url}`;

    // Signature verification is MANDATORY. This webhook mutates state (writes
    // CallLog rows + emits events), so an unsigned/unverifiable request must
    // never be accepted. Fail CLOSED: if no auth token is configured we cannot
    // verify Twilio's signature, so reject rather than trust the caller.
    if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
      return reply.code(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'telephony webhook not configured',
          requestId: req.id,
        },
        hint: 'Set TWILIO_AUTH_TOKEN in comm-service environment to enable signature-verified telephony webhooks',
      });
    }

    const valid = telephony.verifyWebhookSignature(fullUrl, params, signature);
    if (!valid) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature', requestId: req.id },
      });
    }

    const callSid = params.CallSid;
    if (!callSid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'CallSid is required', requestId: req.id },
      });
    }

    const status = mapTwilioStatus(params.CallStatus);
    const durationSec = params.CallDuration ? Number.parseInt(params.CallDuration, 10) : undefined;
    const recordingUrl = params.RecordingUrl || undefined;
    const isTerminal = TERMINAL_STATUSES.has(status);

    // Locate the call record created at click-to-call time.
    const existing = await prisma.callLog.findFirst({ where: { providerCallSid: callSid } });
    if (!existing) {
      // Unknown call (e.g. inbound or a call not placed via this service). Ack so
      // the provider does not retry; nothing to project.
      return reply.send({ success: true, data: { matched: false } });
    }

    const updated = await prisma.callLog.update({
      where: { id: existing.id },
      data: {
        status,
        outcome: isTerminal ? outcomeFor(status) ?? existing.outcome : existing.outcome,
        durationSec: Number.isFinite(durationSec) ? durationSec : existing.durationSec,
        recordingUrl: recordingUrl ?? existing.recordingUrl,
        endedAt: isTerminal ? new Date() : existing.endedAt,
      },
    });

    // On completion, emit call.logged + activity.created so the call lands on the
    // CRM timeline. Fail-open: a publish failure must never fail the webhook.
    if (isTerminal && producer) {
      const sourceEventId = `call:${updated.provider}:${callSid}`;
      const callPayload = {
        callId: updated.id,
        provider: updated.provider,
        providerCallSid: callSid,
        direction: updated.direction,
        fromNumber: updated.fromNumber,
        toNumber: updated.toNumber,
        agentUserId: updated.agentUserId,
        contactId: updated.contactId,
        dealId: updated.dealId,
        accountId: updated.accountId,
        status: updated.status,
        outcome: updated.outcome,
        durationSec: updated.durationSec,
        recordingUrl: updated.recordingUrl,
        startedAt: updated.startedAt.toISOString(),
        endedAt: updated.endedAt?.toISOString() ?? new Date().toISOString(),
        sourceEventId,
      };

      await producer
        .publish(TOPICS.CALLS, {
          type: 'call.logged',
          tenantId: updated.tenantId,
          payload: callPayload,
        })
        .catch((err) => app.log.warn({ err }, 'call.logged publish failed (ignored)'));

      // activity.created (type CALL) on the ACTIVITIES topic — the shape the CRM
      // timeline projectors consume. Carries entity linkage + agent so it is
      // anchored to the contact/deal/account journey.
      await producer
        .publish(TOPICS.ACTIVITIES, {
          type: 'activity.created',
          tenantId: updated.tenantId,
          payload: {
            activityId: updated.id,
            type: 'CALL',
            ownerId: updated.agentUserId,
            actorId: updated.agentUserId,
            contactId: updated.contactId,
            dealId: updated.dealId,
            accountId: updated.accountId,
            direction: updated.direction,
            durationSec: updated.durationSec,
            outcome: updated.outcome,
            recordingUrl: updated.recordingUrl,
            occurredAt: callPayload.endedAt,
            sourceEventId,
          },
        })
        .catch((err) => app.log.warn({ err }, 'activity.created (CALL) publish failed (ignored)'));
    }

    return reply.send({ success: true, data: { matched: true, status: updated.status } });
    });
  });

  // ── Call history for an entity (timeline read) ───────────────────────────
  app.get(
    '/api/v1/telephony/calls',
    { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
    async (req, reply) => {
      const jwt = (req as any).user as JwtPayload;
      const tenantId = jwt.tenantId ?? 'default';
      const q = (req.query ?? {}) as { contactId?: string; dealId?: string; accountId?: string };
      const where: Record<string, unknown> = { tenantId };
      if (q.contactId) where.contactId = q.contactId;
      if (q.dealId) where.dealId = q.dealId;
      if (q.accountId) where.accountId = q.accountId;

      const calls = await prisma.callLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: 200,
      });
      return reply.send({ success: true, data: calls });
    }
  );
}
