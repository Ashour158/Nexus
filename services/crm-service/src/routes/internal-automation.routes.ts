/**
 * Service-to-service internal write routes for the automation engine
 * (workflow-service). These let a fired automation rule actually mutate CRM data
 * (create activities, set fields, reassign owners) without an end-user JWT —
 * workflow-service cannot forge an RS256 user token in prod.
 *
 * Trust model: every route self-verifies `x-service-token` against
 * `INTERNAL_SERVICE_TOKEN` (401 otherwise), takes `tenantId` from the request
 * body (never a header alone), and scopes every write by that tenant. Writes are
 * delegated to the existing entity services so business rules (blueprint
 * transitions, terminal-state guards, field permissions, event emission) still
 * apply. Updatable fields are WHITELISTED per entity — a non-whitelisted field
 * is rejected (400), never silently written.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import { parseCausation, runWithCausation } from '@nexus/kafka';
import type {
  CreateActivityInput,
  UpdateAccountInput,
  UpdateContactInput,
  UpdateDealInput,
  UpdateLeadInput,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createActivitiesService } from '../services/activities.service.js';
import { createDealsService } from '../services/deals.service.js';
import { createLeadsService } from '../services/leads.service.js';
import { createContactsService } from '../services/contacts.service.js';
import { createAccountsService } from '../services/accounts.service.js';

type SetFieldEntity = 'deal' | 'lead' | 'contact' | 'account';

/**
 * Per-entity whitelist of fields an automation rule may write. Anything outside
 * this list is rejected. Relation moves and money/stage changes that need the
 * richer service validation are still routed through the entity service.
 */
const SET_FIELD_WHITELIST: Record<SetFieldEntity, readonly string[]> = {
  deal: ['stageId', 'ownerId', 'status', 'amount', 'probability', 'expectedCloseDate', 'forecastCategory', 'customFields'],
  lead: ['status', 'ownerId', 'rating', 'score'],
  contact: ['ownerId', 'accountId'],
  account: ['ownerId', 'industry'],
};

/** Actor stamped on service writes so field history / audit attributes the change. */
const AUTOMATION_ACTOR_ID = 'automation';
const AUTOMATION_ACTOR_NAME = 'Automation';

function verifyServiceToken(req: FastifyRequest): boolean {
  const token = req.headers['x-service-token'];
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  return Boolean(expected && token === expected);
}

function unauthorized(reply: FastifyReply, requestId: string) {
  return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized', requestId } });
}

function badRequest(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message, requestId } });
}

function notFound(reply: FastifyReply, requestId: string, entity: string) {
  return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: `${entity} not found`, requestId } });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * AU-5 — close the cause chain across the service hop.
 *
 * workflow-service bounds automation cascades with a depth counter, but a rule's
 * write lands here and CRM then emits `deal.updated` / `activity.created`, which
 * can re-trigger the same rule. Unless the emitted event carries the running
 * depth, every hop through CRM looks like a fresh depth-0 trigger and the guard
 * never trips. Establishing the ambient context here makes `NexusProducer.publish`
 * stamp `causationDepth` + `rootEventId` on whatever the entity services emit,
 * without threading an argument through all of them.
 *
 * Absent a cause chain (an ordinary request) `parseCausation` returns undefined
 * and the handler runs unwrapped, so nothing changes for normal traffic.
 */
function withCausation<T>(req: FastifyRequest, fn: () => Promise<T>): Promise<T> {
  const causation = parseCausation(req.headers as Record<string, unknown>, req.body);
  return causation ? runWithCausation(causation, fn) : fn();
}

/**
 * Confirm `{id, tenantId}` names a live record of `entity`. Returns false (→ 404
 * at the call site) when missing, so a rule can never touch another tenant's row.
 */
async function recordExists(prisma: CrmPrisma, entity: SetFieldEntity, id: string, tenantId: string): Promise<boolean> {
  const where = { id, tenantId };
  switch (entity) {
    case 'deal':
      return Boolean(await prisma.deal.findFirst({ where, select: { id: true } }));
    case 'lead':
      return Boolean(await prisma.lead.findFirst({ where, select: { id: true } }));
    case 'contact':
      return Boolean(await prisma.contact.findFirst({ where, select: { id: true } }));
    case 'account':
      return Boolean(await prisma.account.findFirst({ where, select: { id: true } }));
    default:
      return false;
  }
}

export async function registerInternalAutomationRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const activities = createActivitiesService(prisma, producer);
  const deals = createDealsService(prisma, producer);
  const leads = createLeadsService(prisma, producer);
  const contacts = createContactsService(prisma, producer);
  const accounts = createAccountsService(prisma, producer);

  /**
   * Apply a whitelisted field patch to one CRM entity via its service. Shared by
   * the set-field and assign routes. Assumes existence was already verified.
   */
  async function applyEntityUpdate(entity: SetFieldEntity, id: string, tenantId: string, fields: Record<string, unknown>) {
    switch (entity) {
      case 'deal':
        return deals.updateDeal(tenantId, id, fields as UpdateDealInput, { userId: AUTOMATION_ACTOR_ID });
      case 'lead':
        return leads.updateLead(tenantId, id, fields as UpdateLeadInput, AUTOMATION_ACTOR_ID, AUTOMATION_ACTOR_NAME);
      case 'contact':
        return contacts.updateContact(tenantId, id, fields as UpdateContactInput, AUTOMATION_ACTOR_ID, AUTOMATION_ACTOR_NAME);
      case 'account':
        return accounts.updateAccount(tenantId, id, fields as UpdateAccountInput, AUTOMATION_ACTOR_ID, AUTOMATION_ACTOR_NAME);
      default:
        throw new Error(`Unsupported entity: ${String(entity)}`);
    }
  }

  await app.register(
    async (r) => {
      /** Create an Activity (task/call/etc.) for a tenant on behalf of a rule. */
      r.post('/internal/automation/activities', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const body = asRecord(req.body);
        const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
        if (!tenantId) return badRequest(reply, req.id, 'tenantId is required');

        const ownerId = typeof body.ownerId === 'string' ? body.ownerId : '';
        if (!ownerId) return badRequest(reply, req.id, 'ownerId is required');

        const linkKeys: Array<'dealId' | 'contactId' | 'leadId' | 'accountId'> = ['dealId', 'contactId', 'leadId', 'accountId'];
        const links: Record<string, string> = {};
        for (const k of linkKeys) {
          if (typeof body[k] === 'string' && (body[k] as string).length > 0) links[k] = body[k] as string;
        }

        const input = {
          type: typeof body.type === 'string' ? body.type : 'TASK',
          subject: typeof body.subject === 'string' && body.subject.length > 0 ? body.subject : 'Workflow follow-up',
          description: typeof body.description === 'string' ? body.description : undefined,
          priority: typeof body.priority === 'string' ? body.priority : 'NORMAL',
          ownerId,
          dueDate:
            typeof body.dueDate === 'string'
              ? body.dueDate
              : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          ...links,
          customFields: { source: 'workflow', ...asRecord(body.customFields) },
        } as unknown as CreateActivityInput;

        const created = await withCausation(req, () => activities.createActivity(tenantId, input));
        return reply.send({ success: true, data: created });
      });

      /** Patch a whitelisted set of fields on one CRM entity (tenant-scoped). */
      r.post('/internal/automation/set-field', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const body = asRecord(req.body);
        const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
        if (!tenantId) return badRequest(reply, req.id, 'tenantId is required');

        const entity = body.entity as SetFieldEntity;
        if (!entity || !(entity in SET_FIELD_WHITELIST)) {
          return badRequest(reply, req.id, `entity must be one of: ${Object.keys(SET_FIELD_WHITELIST).join(', ')}`);
        }
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) return badRequest(reply, req.id, 'id is required');

        const fields = asRecord(body.fields);
        const fieldKeys = Object.keys(fields);
        if (fieldKeys.length === 0) return badRequest(reply, req.id, 'fields must be a non-empty object');

        const whitelist = SET_FIELD_WHITELIST[entity];
        const rejected = fieldKeys.filter((k) => !whitelist.includes(k));
        if (rejected.length > 0) {
          return badRequest(reply, req.id, `field(s) not writable on ${entity}: ${rejected.join(', ')}`);
        }

        if (!(await recordExists(prisma, entity, id, tenantId))) return notFound(reply, req.id, entity);

        const updated = await withCausation(req, () => applyEntityUpdate(entity, id, tenantId, fields));
        return reply.send({ success: true, data: updated });
      });

      /** Set ownerId on one CRM entity (tenant-scoped). */
      r.post('/internal/automation/assign', async (req, reply) => {
        if (!verifyServiceToken(req)) return unauthorized(reply, req.id);
        const body = asRecord(req.body);
        const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
        if (!tenantId) return badRequest(reply, req.id, 'tenantId is required');

        const entity = body.entity as SetFieldEntity;
        if (!entity || !(entity in SET_FIELD_WHITELIST)) {
          return badRequest(reply, req.id, `entity must be one of: ${Object.keys(SET_FIELD_WHITELIST).join(', ')}`);
        }
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) return badRequest(reply, req.id, 'id is required');
        const ownerId = typeof body.ownerId === 'string' ? body.ownerId : '';
        if (!ownerId) return badRequest(reply, req.id, 'ownerId is required');

        if (!(await recordExists(prisma, entity, id, tenantId))) return notFound(reply, req.id, entity);

        const updated = await withCausation(req, () => applyEntityUpdate(entity, id, tenantId, { ownerId }));
        return reply.send({ success: true, data: updated });
      });
    },
    { prefix: '/api/v1' }
  );
}
