import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';

/**
 * Executes the `entryActions` of a PlaybookStage when a deal enters that stage.
 *
 * `entryActions` is a JSON list persisted on `PlaybookStage.entryActions`. Each
 * entry is a small, declarative action object. A minimal, deliberately-guarded
 * action vocabulary is supported:
 *
 *   - `create_task`      → POST to CRM `/activities` (type TASK)
 *   - `send_notification`→ POST to notification-service `/notifications`
 *   - `set_field`        → PATCH CRM `/deals/:id`
 *   - `assign`           → PATCH CRM `/deals/:id` (ownerId), a set_field shorthand
 *
 * Any action `type` not in the vocabulary is safely ignored. Every action is
 * individually guarded — a failure (bad config, HTTP error, network timeout) is
 * caught and logged and never propagates, so a single bad action cannot block
 * the others or crash the consumer.
 */

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Context assembled from the `deal.stage_changed` event payload. */
export interface StageEntryContext {
  tenantId: string;
  dealId: string;
  newStageId: string;
  ownerId?: string;
  amount?: number;
  correlationId?: string;
}

type ActionRecord = Record<string, unknown>;

function crmBaseUrl(): string {
  return process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1';
}

function notificationBaseUrl(): string {
  return process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003/api/v1';
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * Fire an internal service-to-service HTTP call. Fully guarded: a non-2xx
 * response or a thrown error resolves to `false` (logged by the caller); it
 * never throws. A short timeout prevents a slow downstream from stalling the
 * consumer.
 */
async function postJson(
  url: string,
  body: unknown,
  tenantId: string,
  log: LoggerLike,
  method: 'POST' | 'PATCH' = 'POST'
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
    };
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (token) headers['x-internal-service-token'] = token;

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn({ url, status: res.status }, 'blueprint stage action HTTP call returned non-2xx');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err, url }, 'blueprint stage action HTTP call failed');
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runCreateTask(
  action: ActionRecord,
  ctx: StageEntryContext,
  log: LoggerLike
): Promise<void> {
  const ownerId = str(action.ownerId) ?? ctx.ownerId;
  const subject = str(action.subject) ?? str(action.title) ?? 'Playbook stage task';
  const dueInHours = typeof action.dueInHours === 'number' ? action.dueInHours : 24;
  const body = {
    type: 'TASK',
    subject,
    ownerId,
    dealId: ctx.dealId,
    dueDate: new Date(Date.now() + dueInHours * 60 * 60 * 1000).toISOString(),
    customFields: { source: 'blueprint', stageId: ctx.newStageId },
  };
  await postJson(`${crmBaseUrl()}/activities`, body, ctx.tenantId, log);
}

async function runSendNotification(
  action: ActionRecord,
  ctx: StageEntryContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<void> {
  const userId = str(action.userId) ?? ctx.ownerId;
  const title = str(action.title) ?? 'Playbook update';
  const notifBody = str(action.body) ?? 'A playbook stage was entered.';
  // Dual dispatch: publish a domain event (consumed by the notification pipeline)
  // AND best-effort direct HTTP so the notification lands even if Kafka fan-out
  // is not wired for this path. Both are independently guarded.
  try {
    await producer.publish(TOPICS.NOTIFICATIONS, {
      type: 'blueprint.stage.notification',
      tenantId: ctx.tenantId,
      correlationId: ctx.correlationId,
      payload: {
        userId,
        dealId: ctx.dealId,
        stageId: ctx.newStageId,
        title,
        body: notifBody,
      },
    });
  } catch (err) {
    log.warn({ err }, 'blueprint stage notification publish failed');
  }
  await postJson(
    `${notificationBaseUrl()}/notifications`,
    {
      userId,
      type: 'blueprint.stage',
      title,
      body: notifBody,
      entityType: 'Deal',
      entityId: ctx.dealId,
      actionUrl: `/deals/${ctx.dealId}`,
      metadata: { stageId: ctx.newStageId },
    },
    ctx.tenantId,
    log
  );
}

async function runSetField(
  action: ActionRecord,
  ctx: StageEntryContext,
  log: LoggerLike
): Promise<void> {
  const field = str(action.field);
  if (!field) {
    log.warn({ action }, 'blueprint set_field action missing "field"; skipping');
    return;
  }
  const body: Record<string, unknown> = { [field]: action.value };
  await postJson(`${crmBaseUrl()}/deals/${ctx.dealId}`, body, ctx.tenantId, log, 'PATCH');
}

async function runAssign(
  action: ActionRecord,
  ctx: StageEntryContext,
  log: LoggerLike
): Promise<void> {
  const userId = str(action.userId) ?? str(action.ownerId);
  if (!userId) {
    log.warn({ action }, 'blueprint assign action missing "userId"; skipping');
    return;
  }
  await postJson(
    `${crmBaseUrl()}/deals/${ctx.dealId}`,
    { ownerId: userId },
    ctx.tenantId,
    log,
    'PATCH'
  );
}

/**
 * Execute one action. Never throws — any error is caught and logged so it can
 * neither block sibling actions nor escape the consumer handler.
 */
async function executeAction(
  action: unknown,
  ctx: StageEntryContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<void> {
  try {
    if (!action || typeof action !== 'object') return;
    const record = action as ActionRecord;
    const type = typeof record.type === 'string' ? record.type : '';
    switch (type) {
      case 'create_task':
        await runCreateTask(record, ctx, log);
        return;
      case 'send_notification':
        await runSendNotification(record, ctx, producer, log);
        return;
      case 'set_field':
        await runSetField(record, ctx, log);
        return;
      case 'assign':
        await runAssign(record, ctx, log);
        return;
      default:
        // Unknown action types are intentionally ignored (forward compatible).
        log.info({ type }, 'blueprint stage action type not supported; ignoring');
        return;
    }
  } catch (err) {
    log.error({ err }, 'blueprint stage action execution error (suppressed)');
  }
}

/**
 * Execute every entry action for a stage, sequentially and independently
 * guarded. Returns the number of actions attempted. Never throws.
 */
export async function executeEntryActions(
  entryActions: unknown,
  ctx: StageEntryContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<number> {
  const actions = Array.isArray(entryActions) ? entryActions : [];
  for (const action of actions) {
    await executeAction(action, ctx, producer, log);
  }
  return actions.length;
}
