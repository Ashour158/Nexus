/**
 * Threshold / Big-Deal Alerts (WF-DEPTH).
 *
 * An admin configures a ThresholdAlert — "when a record's <field> <operator>
 * <value>, notify these roles/users" (e.g. Deal.amount >= 100000). Alerts are
 * evaluated on record events by the record consumer. Firing is EDGE-TRIGGERED: an
 * alert fires once when a record CROSSES the threshold (goes from not-satisfied to
 * satisfied) and does not fire again while it stays over the line — the per-record
 * ThresholdAlertState row remembers the last crossing state. A record dropping back
 * under the threshold re-arms the alert so a later re-crossing fires again.
 */
import { NotFoundError } from '@nexus/service-utils';
import { TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import type { NotificationProducer } from '../engine/types.js';
import { evaluateCondition, type ConditionOperator } from './automation-rules.service.js';
import { resolveEntityId } from './scheduled-actions.service.js';

/** Operators a threshold alert may use (subset of the automation operator set). */
export const THRESHOLD_OPERATORS: ConditionOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'in',
  'not_in',
];

export interface ThresholdAlertInput {
  module: string;
  name: string;
  field: string;
  operator: ConditionOperator;
  value: unknown;
  notifyRoles?: string[];
  notifyUsers?: string[];
  isActive?: boolean;
}

export function createThresholdAlertsService(prisma: WorkflowPrisma) {
  return {
    async list(tenantId: string, filters: { module?: string; isActive?: boolean }) {
      return prisma.thresholdAlert.findMany({
        where: {
          tenantId,
          ...(filters.module ? { module: filters.module } : {}),
          ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    async get(tenantId: string, id: string) {
      const row = await prisma.thresholdAlert.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Threshold alert not found');
      return row;
    },

    async create(tenantId: string, createdBy: string, data: ThresholdAlertInput) {
      return prisma.thresholdAlert.create({
        data: {
          tenantId,
          createdBy,
          module: data.module,
          name: data.name,
          field: data.field,
          operator: data.operator,
          value: data.value as object,
          notifyRoles: data.notifyRoles ?? [],
          notifyUsers: data.notifyUsers ?? [],
          isActive: data.isActive ?? true,
        },
      });
    },

    async update(tenantId: string, id: string, data: Partial<ThresholdAlertInput>) {
      await this.get(tenantId, id);
      return prisma.thresholdAlert.update({
        where: { id },
        data: {
          ...(data.module !== undefined ? { module: data.module } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.field !== undefined ? { field: data.field } : {}),
          ...(data.operator !== undefined ? { operator: data.operator } : {}),
          ...(data.value !== undefined ? { value: data.value as object } : {}),
          ...(data.notifyRoles !== undefined ? { notifyRoles: data.notifyRoles } : {}),
          ...(data.notifyUsers !== undefined ? { notifyUsers: data.notifyUsers } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    },

    async remove(tenantId: string, id: string) {
      await this.get(tenantId, id);
      await prisma.thresholdAlert.delete({ where: { id } });
      return { id };
    },

    async toggle(tenantId: string, id: string) {
      const row = await this.get(tenantId, id);
      return prisma.thresholdAlert.update({ where: { id }, data: { isActive: !row.isActive } });
    },

    /** Whether a tenant has any active threshold alerts for a module (consumer gate). */
    async hasActiveAlerts(tenantId: string, module: string): Promise<boolean> {
      const n = await prisma.thresholdAlert.count({ where: { tenantId, module, isActive: true } });
      return n > 0;
    },
  };
}

export type ThresholdAlertsService = ReturnType<typeof createThresholdAlertsService>;

/**
 * Publish a `notification.requested` event per configured recipient (users by id,
 * roles by name). Mirrors the NOTIFY node's event shape so notification-service
 * delivers it identically. Best-effort — never throws into the consumer path.
 */
async function publishThresholdNotifications(
  producer: NotificationProducer | undefined,
  args: {
    tenantId: string;
    alert: { id: string; name: string; module: string; field: string; notifyRoles: string[]; notifyUsers: string[] };
    recordId: string;
    actual: unknown;
  }
): Promise<number> {
  if (!producer) return 0;
  const { tenantId, alert, recordId, actual } = args;
  const title = `Threshold alert: ${alert.name}`;
  const body = `${alert.module} ${recordId} crossed "${alert.name}" (${alert.field} = ${String(actual)})`;

  const base = {
    notificationType: 'workflow.threshold_alert',
    title,
    body,
    entityType: alert.module,
    entityId: recordId,
    metadata: { alertId: alert.id, field: alert.field, value: actual },
  };

  let sent = 0;
  const publishes: Array<Promise<unknown>> = [];
  for (const recipientId of alert.notifyUsers ?? []) {
    if (!recipientId) continue;
    publishes.push(
      producer
        .publish(TOPICS.NOTIFICATIONS, {
          type: 'notification.requested',
          tenantId,
          payload: { channel: 'in_app', recipientId, ...base },
        })
        .then(() => {
          sent++;
        })
        .catch(() => undefined)
    );
  }
  for (const recipientRole of alert.notifyRoles ?? []) {
    if (!recipientRole) continue;
    publishes.push(
      producer
        .publish(TOPICS.NOTIFICATIONS, {
          type: 'notification.requested',
          tenantId,
          payload: { channel: 'in_app', recipientRole, ...base },
        })
        .then(() => {
          sent++;
        })
        .catch(() => undefined)
    );
  }
  await Promise.all(publishes);
  return sent;
}

/**
 * Evaluate every active ThresholdAlert for (tenant, module) against a record event
 * payload. For each alert:
 *   - compute whether the record currently SATISFIES the threshold;
 *   - compare against the stored last-crossing state (ThresholdAlertState);
 *   - on a rising edge (not-satisfied → satisfied) publish notifications to the
 *     configured roles/users and mark crossed=true;
 *   - on a falling edge (satisfied → not-satisfied) re-arm (crossed=false) so a
 *     future re-crossing fires again.
 *
 * Best-effort and self-contained: called from the record consumer. Returns the
 * number of alerts that fired on this event.
 */
export async function evaluateThresholdAlerts(
  prisma: WorkflowPrisma,
  producer: NotificationProducer | undefined,
  args: { tenantId: string; module: string; payload: Record<string, unknown> }
): Promise<number> {
  const { tenantId, module, payload } = args;
  const recordId = resolveEntityId(payload, module);
  if (!recordId) return 0;

  const alerts = await prisma.thresholdAlert.findMany({
    where: { tenantId, module, isActive: true },
  });
  if (alerts.length === 0) return 0;

  let fired = 0;
  for (const alert of alerts) {
    const satisfied = evaluateCondition(
      { field: alert.field, operator: alert.operator as ConditionOperator, value: alert.value },
      payload
    );

    const state = await prisma.thresholdAlertState.findUnique({
      where: { alertId_recordId: { alertId: alert.id, recordId } },
    });
    const wasCrossed = state?.crossed ?? false;

    if (satisfied && !wasCrossed) {
      // Rising edge → fire once, mark crossed.
      const actual = readPath(payload, alert.field);
      await publishThresholdNotifications(producer, {
        tenantId,
        alert,
        recordId,
        actual,
      });
      await prisma.thresholdAlertState.upsert({
        where: { alertId_recordId: { alertId: alert.id, recordId } },
        create: { tenantId, alertId: alert.id, recordId, crossed: true, lastFiredAt: new Date() },
        update: { crossed: true, lastFiredAt: new Date() },
      });
      fired++;
    } else if (!satisfied && wasCrossed) {
      // Falling edge → re-arm so a later re-crossing fires again.
      await prisma.thresholdAlertState.update({
        where: { alertId_recordId: { alertId: alert.id, recordId } },
        data: { crossed: false },
      });
    } else if (!state) {
      // First sighting below the line — record the (un-crossed) baseline so we
      // don't have to special-case "never seen" on the next event.
      await prisma.thresholdAlertState
        .create({ data: { tenantId, alertId: alert.id, recordId, crossed: satisfied, ...(satisfied ? { lastFiredAt: new Date() } : {}) } })
        .catch(() => undefined);
      if (satisfied) {
        const actual = readPath(payload, alert.field);
        await publishThresholdNotifications(producer, { tenantId, alert, recordId, actual });
        fired++;
      }
    }
  }
  return fired;
}

/** Resolve a possibly dot-pathed field against the payload. */
function readPath(payload: Record<string, unknown>, field: string): unknown {
  if (field in payload) return payload[field];
  return field.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, payload);
}
