import type { NexusProducer } from '@nexus/kafka';
import { TOPICS } from '@nexus/kafka';

/**
 * Executes the AFTER actions of a BlueprintTransition and the escalation config
 * of an SLA breach. All I/O is individually guarded — a single failing action
 * can neither block its siblings nor propagate out of the transition, mirroring
 * the guarantees of `stage-actions.service.ts`.
 */

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface TransitionActionContext {
  tenantId: string;
  module: string;
  recordId: string;
  fromStageId: string;
  toStageId: string;
  transitionId: string;
  actorId?: string;
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

/** Map a module name to its CRM collection path segment. */
function modulePath(module: string): string {
  const m = module.toLowerCase();
  // Allow both singular ("deal") and plural ("deals") module names.
  if (m.endsWith('s')) return m;
  return `${m}s`;
}

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
      log.warn({ url, status: res.status }, 'blueprint transition action HTTP call returned non-2xx');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err, url }, 'blueprint transition action HTTP call failed');
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function runFieldUpdate(
  update: ActionRecord,
  ctx: TransitionActionContext,
  log: LoggerLike
): Promise<void> {
  const field = str(update.field);
  if (!field) {
    log.warn({ update }, 'blueprint fieldUpdate missing "field"; skipping');
    return;
  }
  const body: Record<string, unknown> = { [field]: update.value };
  await postJson(
    `${crmBaseUrl()}/${modulePath(ctx.module)}/${ctx.recordId}`,
    body,
    ctx.tenantId,
    log,
    'PATCH'
  );
}

async function runTask(
  task: ActionRecord,
  ctx: TransitionActionContext,
  log: LoggerLike
): Promise<void> {
  const subject = str(task.subject) ?? str(task.title) ?? 'Blueprint transition task';
  const ownerId = str(task.ownerId) ?? ctx.actorId;
  const dueInHours = typeof task.dueInHours === 'number' ? task.dueInHours : 24;
  const body: Record<string, unknown> = {
    type: 'TASK',
    subject,
    ownerId,
    dueDate: new Date(Date.now() + dueInHours * 60 * 60 * 1000).toISOString(),
    customFields: {
      source: 'blueprint-transition',
      module: ctx.module,
      recordId: ctx.recordId,
      transitionId: ctx.transitionId,
    },
  };
  // Attach the record to the activity when it is a deal (the CRM activity model
  // has a first-class dealId); otherwise the linkage rides in customFields.
  if (modulePath(ctx.module) === 'deals') body.dealId = ctx.recordId;
  await postJson(`${crmBaseUrl()}/activities`, body, ctx.tenantId, log);
}

async function runAlert(
  alert: ActionRecord,
  ctx: TransitionActionContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<void> {
  const userId = str(alert.userId) ?? ctx.actorId;
  const title = str(alert.title) ?? 'Blueprint transition';
  const body = str(alert.body) ?? `Record ${ctx.recordId} moved to stage ${ctx.toStageId}.`;
  const roles = Array.isArray(alert.roles)
    ? (alert.roles as unknown[]).filter((r): r is string => typeof r === 'string')
    : undefined;

  try {
    await producer.publish(TOPICS.NOTIFICATIONS, {
      type: 'blueprint.transition.notification',
      tenantId: ctx.tenantId,
      correlationId: ctx.correlationId,
      payload: {
        userId,
        roles,
        module: ctx.module,
        recordId: ctx.recordId,
        stageId: ctx.toStageId,
        transitionId: ctx.transitionId,
        title,
        body,
      },
    });
  } catch (err) {
    log.warn({ err }, 'blueprint transition alert publish failed');
  }

  // Best-effort direct HTTP so the alert lands even where Kafka fan-out to the
  // notification pipeline is not wired. Skipped when no concrete userId exists
  // (role-only alerts are delivered via the event above).
  if (userId) {
    await postJson(
      `${notificationBaseUrl()}/notifications`,
      {
        userId,
        type: 'blueprint.transition',
        title,
        body,
        entityType: ctx.module,
        entityId: ctx.recordId,
        actionUrl: `/${modulePath(ctx.module)}/${ctx.recordId}`,
        metadata: { stageId: ctx.toStageId, transitionId: ctx.transitionId },
      },
      ctx.tenantId,
      log
    );
  }
}

async function runFunction(
  fn: ActionRecord,
  ctx: TransitionActionContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<void> {
  const name = str(fn.name);
  if (!name) {
    log.warn({ fn }, 'blueprint function action missing "name"; skipping');
    return;
  }
  // Custom "functions" are dispatched as domain events so an automation/webhook
  // worker can pick them up. We never execute arbitrary code in-process.
  try {
    await producer.publish(TOPICS.BLUEPRINT, {
      type: 'blueprint.transition.function',
      tenantId: ctx.tenantId,
      correlationId: ctx.correlationId,
      payload: {
        function: name,
        module: ctx.module,
        recordId: ctx.recordId,
        transitionId: ctx.transitionId,
        args: fn.payload ?? fn.args ?? {},
      },
    });
  } catch (err) {
    log.warn({ err, name }, 'blueprint function dispatch failed');
  }
}

/** Summary of what an afterActions run attempted, for logging & API responses. */
export interface AfterActionsSummary {
  fieldUpdates: number;
  alerts: number;
  tasks: number;
  functions: number;
}

/**
 * Execute a transition's `afterActions` JSON. Each group is optional and each
 * item is independently guarded. Never throws.
 */
export async function executeAfterActions(
  afterActions: unknown,
  ctx: TransitionActionContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<AfterActionsSummary> {
  const summary: AfterActionsSummary = { fieldUpdates: 0, alerts: 0, tasks: 0, functions: 0 };
  const cfg = (afterActions && typeof afterActions === 'object' ? afterActions : {}) as ActionRecord;

  const fieldUpdates = Array.isArray(cfg.fieldUpdates) ? cfg.fieldUpdates : [];
  for (const u of fieldUpdates) {
    if (u && typeof u === 'object') {
      await runFieldUpdate(u as ActionRecord, ctx, log);
      summary.fieldUpdates++;
    }
  }

  const tasks = Array.isArray(cfg.tasks) ? cfg.tasks : [];
  for (const t of tasks) {
    if (t && typeof t === 'object') {
      await runTask(t as ActionRecord, ctx, log);
      summary.tasks++;
    }
  }

  const alerts = Array.isArray(cfg.alerts) ? cfg.alerts : [];
  for (const a of alerts) {
    if (a && typeof a === 'object') {
      await runAlert(a as ActionRecord, ctx, producer, log);
      summary.alerts++;
    }
  }

  const functions = Array.isArray(cfg.functions) ? cfg.functions : [];
  for (const f of functions) {
    if (f && typeof f === 'object') {
      await runFunction(f as ActionRecord, ctx, producer, log);
      summary.functions++;
    }
  }

  return summary;
}

/**
 * Execute an SLA-breach escalation config. Fully guarded; never throws. Reuses
 * the alert / reassign primitives. Returns the number of side effects attempted.
 */
export async function executeEscalation(
  escalationConfig: unknown,
  ctx: TransitionActionContext,
  producer: NexusProducer,
  log: LoggerLike
): Promise<number> {
  const cfg = (escalationConfig && typeof escalationConfig === 'object'
    ? escalationConfig
    : {}) as ActionRecord;
  let count = 0;

  const message =
    str(cfg.message) ?? `SLA breached: record ${ctx.recordId} has overstayed stage ${ctx.toStageId}.`;

  const notifyUserIds = Array.isArray(cfg.notifyUserIds)
    ? (cfg.notifyUserIds as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  for (const userId of notifyUserIds) {
    await runAlert({ userId, title: 'SLA breached', body: message }, ctx, producer, log);
    count++;
  }

  const notifyRoles = Array.isArray(cfg.notifyRoles)
    ? (cfg.notifyRoles as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  if (notifyRoles.length > 0) {
    await runAlert({ roles: notifyRoles, title: 'SLA breached', body: message }, ctx, producer, log);
    count++;
  }

  // Explicit alert objects, if the author wants full control.
  const alerts = Array.isArray(cfg.alerts) ? cfg.alerts : [];
  for (const a of alerts) {
    if (a && typeof a === 'object') {
      await runAlert(a as ActionRecord, ctx, producer, log);
      count++;
    }
  }

  const reassignTo = str(cfg.reassignTo);
  if (reassignTo) {
    await postJson(
      `${crmBaseUrl()}/${modulePath(ctx.module)}/${ctx.recordId}`,
      { ownerId: reassignTo },
      ctx.tenantId,
      log,
      'PATCH'
    );
    count++;
  }

  return count;
}

/**
 * Best-effort snapshot fetch of the underlying CRM record, used to evaluate
 * Before criteria. On any failure returns `null` so callers can decide to skip
 * criteria evaluation rather than falsely block a transition.
 */
export async function fetchRecordSnapshot(
  module: string,
  recordId: string,
  tenantId: string,
  log: LoggerLike
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const headers: Record<string, string> = { 'x-tenant-id': tenantId };
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (token) headers['x-internal-service-token'] = token;
    const res = await fetch(`${crmBaseUrl()}/${modulePath(module)}/${recordId}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    // CRM envelopes responses as { success, data } — unwrap when present.
    const data = (json && typeof json === 'object' && 'data' in json ? json.data : json) as
      | Record<string, unknown>
      | null;
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    log.warn({ err, module, recordId }, 'blueprint record snapshot fetch failed');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
