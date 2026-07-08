import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { InAppChannel } from '../channels/in-app.channel.js';
import type { EmailChannel } from '../channels/email.channel.js';
import type { SmsChannel } from '../channels/sms.channel.js';
import type { PushChannel } from '../channels/push.channel.js';
import type { WhatsAppChannel } from '../channels/whatsapp.channel.js';
import { renderActionEmail } from '../channels/email.channel.js';
import type { PreferencesService } from '../services/preferences.service.js';

interface OwnerLookup {
  (
    tenantId: string,
    userId: string
  ): Promise<{ email?: string; name?: string; phone?: string; deviceToken?: string }>;
}

interface DealConsumerDeps {
  inApp: InAppChannel;
  email: EmailChannel;
  sms: SmsChannel;
  push: PushChannel;
  whatsapp: WhatsAppChannel;
  prefs: PreferencesService;
  lookupOwner: OwnerLookup;
  log: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Best-effort SMS + push + WhatsApp fan-out. Each channel is already a guarded
 * no-op when unconfigured; this helper additionally isolates any unexpected
 * failure so one channel can never block the other or the consumer. WhatsApp
 * reuses the recipient's phone number and is only attempted when the channel is
 * configured.
 *
 * Per-channel opt-out (NOT-11) is enforced here: each channel is checked against
 * the recipient's preferences and skipped when disabled. Preference lookups are
 * fail-open (see preferences.service.ts) so a check error never drops a send.
 */
async function fanOutSmsPush(
  deps: Pick<DealConsumerDeps, 'sms' | 'push' | 'whatsapp' | 'prefs' | 'log'>,
  recipient: { tenantId: string; userId: string; phone?: string; deviceToken?: string },
  msg: { title: string; body: string; actionUrl?: string }
): Promise<void> {
  const { tenantId, userId } = recipient;
  const [smsOn, pushOn, whatsappOn] = await Promise.all([
    deps.prefs.isChannelEnabled(tenantId, userId, 'SMS'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'PUSH'),
    deps.prefs.isChannelEnabled(tenantId, userId, 'WHATSAPP'),
  ]);
  await Promise.allSettled([
    recipient.phone && smsOn
      ? deps.sms
          .send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'sms fan-out failed'))
      : Promise.resolve(),
    recipient.deviceToken && pushOn
      ? deps.push
          .send({
            to: recipient.deviceToken,
            title: msg.title,
            body: msg.body,
            actionUrl: msg.actionUrl,
          })
          .catch((err) => deps.log.error({ err }, 'push fan-out failed'))
      : Promise.resolve(),
    recipient.phone && whatsappOn && deps.whatsapp.isConfigured()
      ? deps.whatsapp
          .send({ to: recipient.phone, body: `${msg.title}: ${msg.body}` })
          .catch((err) => deps.log.error({ err }, 'whatsapp fan-out failed'))
      : Promise.resolve(),
  ]);
}

/**
 * Guarded email send that first honours the recipient's EMAIL preference
 * (NOT-11). Fail-open via `isChannelEnabled`.
 */
async function sendEmailIfEnabled(
  deps: Pick<DealConsumerDeps, 'email' | 'prefs' | 'log'>,
  recipient: { tenantId: string; userId: string; email?: string },
  mail: { subject: string; heading: string; body: string; actionLabel: string; actionUrl: string }
): Promise<void> {
  if (!recipient.email) return;
  const enabled = await deps.prefs.isChannelEnabled(
    recipient.tenantId,
    recipient.userId,
    'EMAIL'
  );
  if (!enabled) return;
  await deps.email.send({
    to: recipient.email,
    subject: mail.subject,
    html: renderActionEmail({
      heading: mail.heading,
      body: mail.body,
      actionLabel: mail.actionLabel,
      actionUrl: mail.actionUrl,
    }),
  });
}

/**
 * Payload shape of the `deal.rotten` event as emitted by crm-service's
 * rotten-deals poller (see services/crm-service/src/lib/rotten-deals.poller.ts).
 * `deal.rotten` is not part of the shared `NexusKafkaEvent` union, so we describe
 * its payload locally and read it defensively.
 */
interface DealRottenPayload {
  dealId?: string;
  ownerId?: string;
  accountId?: string;
  stageId?: string;
  idleDays?: number;
  rottenDays?: number;
  detectedAt?: string;
}

/**
 * Payload shape of the `deal.at_risk` event as emitted by crm-service's AI
 * at-risk detector (see services/crm-service/src/lib/ai/scoring.service.ts,
 * `detectAtRiskDeal`). Like `deal.rotten`, this event is not part of the shared
 * `NexusKafkaEvent` union, so we describe its payload locally and read it
 * defensively.
 */
interface DealAtRiskAnomaly {
  signal?: string;
  value?: number;
  z?: number;
  explanation?: string;
}

interface DealAtRiskPayload {
  dealId?: string;
  ownerId?: string;
  accountId?: string;
  stageId?: string;
  reasons?: string[];
  anomalies?: DealAtRiskAnomaly[];
  idleDays?: number;
  daysSinceLastActivity?: number;
  detectedAt?: string;
}

/**
 * Payload shape of the `deal.assigned` event emitted by crm-service's updateDeal
 * when a deal's owner changes (see services/crm-service/src/services/deals.service.ts).
 * Not part of the shared `NexusKafkaEvent` union, so we read it defensively.
 */
interface DealAssignedPayload {
  dealId?: string;
  newOwnerId?: string;
  previousOwnerId?: string | null;
  dealName?: string;
}

/**
 * Deal events → notifications. Handles deal.won / deal.lost /
 * deal.stage_changed (with rotten-deal detection against the CRM service),
 * deal.rotten (emitted asynchronously by the crm-service rotten-deals poller),
 * deal.at_risk (emitted by the crm-service AI at-risk detector) and
 * deal.assigned (owner handoff — notifies the new owner, NOT-02).
 */
export async function startDealConsumer(deps: DealConsumerDeps): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('notification-service.deals');

  // `deal.assigned` → notify the NEW owner they now own the deal (NOT-02). Guard on
  // required fields so a malformed event can never throw and stall the loop. The
  // NexusConsumer dedupes by eventId so a reassignment is announced once.
  consumer.on('deal.assigned', async (event) => {
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as DealAssignedPayload;
    if (!payload.dealId || !payload.newOwnerId) return;
    const dealLabel = payload.dealName ? `"${payload.dealName}"` : payload.dealId;
    const title = 'Deal assigned to you';
    const body = `You are now the owner of deal ${dealLabel}.`;
    const actionUrl = `/deals/${payload.dealId}`;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.newOwnerId,
      type: 'DEAL_ASSIGNED',
      title,
      body,
      entityType: 'deal',
      entityId: payload.dealId,
      actionUrl,
      metadata: {
        dealName: payload.dealName,
        previousOwnerId: payload.previousOwnerId ?? undefined,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.newOwnerId);
    await sendEmailIfEnabled(
      deps,
      { tenantId: evt.tenantId, userId: payload.newOwnerId, email: owner.email },
      { subject: title, heading: title, body, actionLabel: 'View deal', actionUrl }
    );
    await fanOutSmsPush(
      deps,
      { tenantId: evt.tenantId, userId: payload.newOwnerId, ...owner },
      { title, body, actionUrl }
    );
  });

  consumer.on('deal.won', async (event) => {
    if (event.type !== 'deal.won') return;
    const { payload } = event;
    const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
    const title = '🎉 Deal won';
    const body = `Congrats! You closed deal ${payload.dealId} for ${payload.amount} ${payload.currency ?? 'USD'}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: 'deal.won',
      title,
      body,
      entityType: 'Deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
      metadata: { amount: payload.amount, currency: payload.currency },
    });
    await sendEmailIfEnabled(
      deps,
      { tenantId: event.tenantId, userId: payload.ownerId, email: owner.email },
      { subject: title, heading: title, body, actionLabel: 'View deal', actionUrl: `/deals/${payload.dealId}` }
    );
    await fanOutSmsPush(
      deps,
      { tenantId: event.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl: `/deals/${payload.dealId}` }
    );
  });

  consumer.on('deal.lost', async (event) => {
    if (event.type !== 'deal.lost') return;
    const { payload } = event;
    const title = 'Deal lost';
    const body = `Deal ${payload.dealId} was marked lost${payload.reason ? ` (${payload.reason})` : ''}.`;
    await deps.inApp.send({
      tenantId: event.tenantId,
      userId: payload.ownerId,
      type: 'deal.lost',
      title,
      body,
      entityType: 'Deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
    });
    const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
    await sendEmailIfEnabled(
      deps,
      { tenantId: event.tenantId, userId: payload.ownerId, email: owner.email },
      { subject: title, heading: title, body, actionLabel: 'View deal', actionUrl: `/deals/${payload.dealId}` }
    );
    await fanOutSmsPush(
      deps,
      { tenantId: event.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl: `/deals/${payload.dealId}` }
    );
  });

  consumer.on('deal.stage_changed', async (event) => {
    if (event.type !== 'deal.stage_changed') return;
    const { payload } = event;
    // Architectural fix: rotten-deal data must travel in the event payload.
    // Services must NOT make synchronous HTTP calls inside consumers — it creates
    // temporal coupling and failure cascades.
    const rottenDays = payload.rottenDays;
    const stageChangedAt = payload.stageChangedAt
      ? new Date(payload.stageChangedAt).getTime()
      : null;
    if (rottenDays && stageChangedAt) {
      const daysInStage = Math.floor(
        (Date.now() - stageChangedAt) / (1000 * 60 * 60 * 24)
      );
      if (daysInStage > rottenDays) {
        const title = '⏰ Deal is stalling';
        const body = `Deal ${payload.dealId} has been in stage for ${daysInStage} days (limit ${rottenDays}). Time to nudge it.`;
        await deps.inApp.send({
          tenantId: event.tenantId,
          userId: payload.ownerId,
          type: 'deal.rotten',
          title,
          body,
          entityType: 'Deal',
          entityId: payload.dealId,
          actionUrl: `/deals/${payload.dealId}`,
          metadata: { daysInStage, rottenDays },
        });
        const owner = await deps.lookupOwner(event.tenantId, payload.ownerId);
        await fanOutSmsPush(
          deps,
          { tenantId: event.tenantId, userId: payload.ownerId, ...owner },
          { title, body, actionUrl: `/deals/${payload.dealId}` }
        );
      }
    }
  });

  // `deal.rotten` is published once per rotten-crossing by the crm-service
  // rotten-deals poller. The NexusConsumer already dedupes by eventId, so this
  // won't spam on every poll; we additionally guard on required fields so a
  // malformed event can never throw and stall the loop.
  consumer.on('deal.rotten', async (event) => {
    // `deal.rotten` is not in the shared NexusKafkaEvent union, so we read the
    // event shape generically. The handler is only dispatched for this type.
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as DealRottenPayload;
    if (!payload.dealId || !payload.ownerId) return;
    const idleDays = payload.idleDays;
    const rottenDays = payload.rottenDays;
    const idlePhrase =
      typeof idleDays === 'number'
        ? `has been idle for ${idleDays} day${idleDays === 1 ? '' : 's'}`
        : 'has gone stale';
    const limitPhrase =
      typeof rottenDays === 'number' ? ` (threshold ${rottenDays} days)` : '';
    const title = '⏰ Deal has gone rotten';
    const body = `Deal ${payload.dealId} ${idlePhrase}${limitPhrase}. Time to follow up.`;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.ownerId,
      type: 'DEAL_ROTTEN',
      title,
      body,
      entityType: 'deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
      metadata: {
        idleDays,
        rottenDays,
        stageId: payload.stageId,
        accountId: payload.accountId,
        detectedAt: payload.detectedAt,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.ownerId);
    await sendEmailIfEnabled(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, email: owner.email },
      { subject: title, heading: title, body, actionLabel: 'View deal', actionUrl: `/deals/${payload.dealId}` }
    );
    await fanOutSmsPush(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl: `/deals/${payload.dealId}` }
    );
  });

  // `deal.at_risk` is published by the crm-service AI at-risk detector
  // (scoring.service.ts `detectAtRiskDeal`) whenever a deal trips a threshold
  // rule or a cohort anomaly. Without this handler the whole AI at-risk feature
  // is a silent no-op. The NexusConsumer dedupes by eventId, and we guard on
  // required fields so a malformed event can never throw and stall the loop.
  consumer.on('deal.at_risk', async (event) => {
    // `deal.at_risk` is not in the shared NexusKafkaEvent union, so we read the
    // event shape generically. The handler is only dispatched for this type.
    const evt = event as { tenantId: string; payload?: unknown };
    const payload = (evt.payload ?? {}) as DealAtRiskPayload;
    if (!payload.dealId || !payload.ownerId) return;
    const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
    const anomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];
    // Prefer the human-readable threshold reasons; fall back to anomaly
    // explanations; finally a generic phrase so the body is never empty.
    const why =
      reasons.length > 0
        ? reasons.join(' ')
        : anomalies
            .map((a) => a.explanation)
            .filter((e): e is string => typeof e === 'string' && e.length > 0)
            .join(' ') || 'It is showing warning signs and needs attention.';
    const title = '⚠️ Deal at risk';
    const body = `Deal ${payload.dealId} is at risk. ${why}`;
    await deps.inApp.send({
      tenantId: evt.tenantId,
      userId: payload.ownerId,
      type: 'DEAL_AT_RISK',
      title,
      body,
      entityType: 'deal',
      entityId: payload.dealId,
      actionUrl: `/deals/${payload.dealId}`,
      metadata: {
        reasons,
        anomalies,
        idleDays: payload.idleDays,
        daysSinceLastActivity: payload.daysSinceLastActivity,
        stageId: payload.stageId,
        accountId: payload.accountId,
        detectedAt: payload.detectedAt,
      },
    });
    const owner = await deps.lookupOwner(evt.tenantId, payload.ownerId);
    await sendEmailIfEnabled(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, email: owner.email },
      { subject: title, heading: title, body, actionLabel: 'View deal', actionUrl: `/deals/${payload.dealId}` }
    );
    await fanOutSmsPush(
      deps,
      { tenantId: evt.tenantId, userId: payload.ownerId, ...owner },
      { title, body, actionUrl: `/deals/${payload.dealId}` }
    );
  });

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
