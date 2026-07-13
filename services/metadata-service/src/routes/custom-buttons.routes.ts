import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  checkPermission,
  ValidationError,
  ForbiddenError,
} from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { MetadataPrisma } from '../prisma.js';
import {
  createCustomButtonsService,
  BUTTON_MODULES,
  BUTTON_PLACEMENTS,
  BUTTON_ACTION_TYPES,
  WEBHOOK_METHODS,
  type ButtonPlacement,
} from '../services/custom-buttons.service.js';

// ─── Per-actionType config schemas ────────────────────────────────────────────

const RunWorkflowConfig = z.object({ workflowId: z.string().min(1).max(200) }).strict();
const UpdateFieldsConfig = z
  .object({ updates: z.record(z.unknown()).refine((u) => Object.keys(u).length > 0, 'updates must not be empty') })
  .strict();
const OpenUrlConfig = z.object({ urlTemplate: z.string().min(1).max(2000) }).strict();
const CallWebhookConfig = z
  .object({
    url: z.string().min(1).max(2000),
    method: z.enum(WEBHOOK_METHODS).default('POST'),
    bodyTemplate: z.union([z.string().max(20000), z.record(z.unknown())]).optional(),
  })
  .strict();

/** Validate a `config` blob against the given actionType; returns the parsed config. */
function parseConfigFor(actionType: string, config: unknown): Record<string, unknown> {
  let result;
  switch (actionType) {
    case 'RUN_WORKFLOW':
      result = RunWorkflowConfig.safeParse(config);
      break;
    case 'UPDATE_FIELDS':
      result = UpdateFieldsConfig.safeParse(config);
      break;
    case 'OPEN_URL':
      result = OpenUrlConfig.safeParse(config);
      break;
    case 'CALL_WEBHOOK':
      result = CallWebhookConfig.safeParse(config);
      break;
    default:
      throw new ValidationError(`Unsupported actionType: ${actionType}`);
  }
  if (!result.success) throw new ValidationError('Invalid config for actionType', result.error.flatten());
  return result.data as Record<string, unknown>;
}

const CreateButtonBody = z.object({
  module: z.enum(BUTTON_MODULES),
  label: z.string().min(1).max(120),
  icon: z.string().max(120).optional(),
  placement: z.enum(BUTTON_PLACEMENTS).default('RECORD'),
  actionType: z.enum(BUTTON_ACTION_TYPES),
  config: z.record(z.unknown()),
  visibilityRoles: z.array(z.string().min(1).max(100)).max(100).default([]),
  confirmRequired: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

const UpdateButtonBody = z.object({
  label: z.string().min(1).max(120).optional(),
  icon: z.string().max(120).nullable().optional(),
  placement: z.enum(BUTTON_PLACEMENTS).optional(),
  actionType: z.enum(BUTTON_ACTION_TYPES).optional(),
  config: z.record(z.unknown()).optional(),
  visibilityRoles: z.array(z.string().min(1).max(100)).max(100).optional(),
  confirmRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

const ResolveQuery = z.object({
  module: z.enum(BUTTON_MODULES),
  placement: z.enum(['RECORD', 'LIST']).default('RECORD'),
});

const ExecuteBody = z.object({
  recordId: z.string().min(1).max(200),
  recordData: z.record(z.unknown()).default({}),
});

// Execute is gated with the target module's UPDATE permission.
const MODULE_EXECUTE_PERMISSION: Record<string, string> = {
  lead: PERMISSIONS.LEADS.UPDATE,
  contact: PERMISSIONS.CONTACTS.UPDATE,
  account: PERMISSIONS.ACCOUNTS.UPDATE,
  deal: PERMISSIONS.DEALS.UPDATE,
  quote: PERMISSIONS.QUOTES.UPDATE,
  ticket: PERMISSIONS.TICKETS.UPDATE,
};

export async function registerCustomButtonsRoutes(
  app: FastifyInstance,
  prisma: MetadataPrisma,
  producer?: NexusProducer,
): Promise<void> {
  const service = createCustomButtonsService(prisma, {
    emitEvent: producer
      ? async (type, tenantId, payload) => {
          await producer.publish(TOPICS.WORKFLOWS, { type, tenantId, payload });
        }
      : undefined,
  });

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      // ── Admin CRUD (SETTINGS-gated) ─────────────────────────────────────────
      r.get('/custom-buttons', READ, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { module, placement } = request.query as { module?: string; placement?: string };
        const rows = await service.list(jwt.tenantId, { module, placement });
        return reply.send({ success: true, data: rows });
      });

      r.post('/custom-buttons', WRITE, async (request, reply) => {
        const parsed = CreateButtonBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const config = parseConfigFor(parsed.data.actionType, parsed.data.config);
        const jwt = request.user as JwtPayload;
        const row = await service.create(jwt.tenantId, { ...parsed.data, config });
        return reply.code(201).send({ success: true, data: row });
      });

      // ── Resolve — the buttons the UI should render for this caller ──────────
      r.get('/custom-buttons/resolve', READ, async (request, reply) => {
        const parsed = ResolveQuery.safeParse(request.query);
        if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const rows = await service.resolve(jwt.tenantId, {
          module: parsed.data.module,
          placement: parsed.data.placement as ButtonPlacement,
          roles: jwt.roles ?? [],
        });
        return reply.send({ success: true, data: rows });
      });

      r.get('/custom-buttons/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        const row = await service.getById(jwt.tenantId, id);
        return reply.send({ success: true, data: row });
      });

      r.patch('/custom-buttons/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateButtonBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        // If config or actionType changes, re-validate config against the
        // effective actionType (existing row's type when not being changed).
        let config = parsed.data.config;
        if (parsed.data.config !== undefined || parsed.data.actionType !== undefined) {
          const current = await service.getById(jwt.tenantId, id);
          const effectiveType = parsed.data.actionType ?? current.actionType;
          const effectiveConfig = parsed.data.config ?? (current.config as Record<string, unknown>);
          config = parseConfigFor(effectiveType, effectiveConfig);
        }
        const row = await service.update(jwt.tenantId, id, { ...parsed.data, config });
        return reply.send({ success: true, data: row });
      });

      r.delete('/custom-buttons/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.remove(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Execute — gated with the target module's UPDATE permission ──────────
      r.post('/custom-buttons/:id/execute', async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = ExecuteBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const button = await service.getById(jwt.tenantId, id);
        if (!button.isActive) throw new ValidationError('Button is not active');

        const requiredPerm = MODULE_EXECUTE_PERMISSION[button.module];
        if (!requiredPerm || !checkPermission(jwt.permissions ?? [], requiredPerm)) {
          throw new ForbiddenError(requiredPerm ?? `execute:${button.module}`);
        }

        const result = await service.execute(jwt.tenantId, button, {
          recordId: parsed.data.recordId,
          recordData: parsed.data.recordData,
          actorId: jwt.sub,
        });
        return reply.send({ success: true, data: result });
      });
    },
    { prefix: '/api/v1' },
  );
}
