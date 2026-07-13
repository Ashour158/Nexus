import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { createExecutionsService } from '../services/executions.service.js';
import type { NexusProducer } from '@nexus/kafka';

interface TriggerCondition {
  field?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value?: unknown;
}

function evaluateCondition(
  condition: TriggerCondition,
  payload: Record<string, unknown>
): boolean {
  if (!condition.field || !condition.operator) return true;
  const actual = payload[condition.field];
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      return (
        typeof actual === 'string' &&
        typeof expected === 'string' &&
        actual.includes(expected)
      );
    case 'in':
      return (
        Array.isArray(expected) && expected.includes(actual as never)
      );
    default:
      return true;
  }
}

function evaluateConditions(
  conditionsJson: unknown,
  payload: Record<string, unknown>
): boolean {
  if (!conditionsJson || typeof conditionsJson !== 'object') return true;
  const conditions = conditionsJson as { rules?: TriggerCondition[]; match?: 'all' | 'any' };
  const rules = Array.isArray(conditions.rules) ? conditions.rules : [];
  if (rules.length === 0) return true;

  const match = conditions.match ?? 'all';
  const results = rules.map((rule) => evaluateCondition(rule, payload));
  return match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

export async function startTriggerConsumer(
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('workflow-service.triggers');
  const executions = createExecutionsService(prisma, producer);

  const onEvent = async (event: { type: string; tenantId: string; payload: Record<string, unknown> }) => {
    const active = await prisma.workflowTemplate.findMany({
      where: { tenantId: event.tenantId, trigger: event.type, isActive: true },
      select: { id: true, triggerConditions: true },
    });
    for (const wf of active) {
      // Evaluate trigger conditions before firing
      if (!evaluateConditions(wf.triggerConditions, event.payload)) {
        continue;
      }
      const execution = await executions.createExecution(
        event.tenantId,
        wf.id,
        event.type,
        event.payload
      );
      await executions.runExecution(execution.id);
    }
  };

  consumer.on('deal.created', onEvent);
  consumer.on('deal.stage_changed', onEvent);
  consumer.on('deal.won', onEvent);
  consumer.on('deal.lost', onEvent);
  consumer.on('lead.created', onEvent);
  consumer.on('activity.created', onEvent);
  consumer.on('activity.completed', onEvent);
  consumer.on('quote.created', onEvent);
  consumer.on('quote.sent', onEvent);
  consumer.on('quote.accepted', onEvent);
  consumer.on('quote.rejected', onEvent);
  consumer.on('contact.created', onEvent);
  consumer.on('contact.updated', onEvent);
  consumer.on('contact.archived', onEvent);
  consumer.on('contact.merged', onEvent);
  consumer.on('contact.restored', onEvent);
  consumer.on('account.created', onEvent);
  consumer.on('account.updated', onEvent);
  consumer.on('account.archived', onEvent);
  consumer.on('account.merged', onEvent);
  consumer.on('account.restored', onEvent);
  consumer.on('approval.request.approved', onEvent);
  consumer.on('approval.request.rejected', onEvent);

  // Custom-button RUN_WORKFLOW action: metadata-service emits
  // `custom_button.workflow.trigger` on the workflows topic when a CustomButton
  // with actionType RUN_WORKFLOW is executed. Unlike the event-keyed triggers
  // above (which match every active workflow whose `trigger` equals the event
  // type), this targets ONE specific workflow by the `workflowId` carried in the
  // payload, so it bypasses the trigger-match lookup and starts that workflow
  // directly — reusing the same createExecution → runExecution path.
  const onCustomButtonWorkflowTrigger = async (event: {
    type: string;
    tenantId: string;
    payload: Record<string, unknown>;
  }) => {
    const workflowId = event.payload.workflowId;
    if (typeof workflowId !== 'string' || workflowId.length === 0) return;
    const wf = await prisma.workflowTemplate.findFirst({
      where: { id: workflowId, tenantId: event.tenantId, isActive: true },
      select: { id: true },
    });
    // Unknown / cross-tenant / inactive workflow id — ack and drop.
    if (!wf) return;
    const execution = await executions.createExecution(
      event.tenantId,
      wf.id,
      event.type,
      event.payload
    );
    await executions.runExecution(execution.id);
  };
  consumer.on('custom_button.workflow.trigger', onCustomButtonWorkflowTrigger);

  await consumer.subscribe([
    TOPICS.DEALS,
    TOPICS.LEADS,
    TOPICS.ACTIVITIES,
    TOPICS.QUOTES,
    TOPICS.CONTACTS,
    TOPICS.ACCOUNTS,
    TOPICS.NOTIFICATIONS,
    TOPICS.WORKFLOWS,
  ]);
  await consumer.start();
  return consumer;
}
