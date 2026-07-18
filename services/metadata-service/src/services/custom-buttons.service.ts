import { NotFoundError, ValidationError } from '@nexus/service-utils';
import { lookup } from 'node:dns/promises';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { CustomButton } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import { substituteRecordTokens, substituteInJsonValue } from './token-substitution.js';

// ─── Enumerations (kept in sync with the zod schemas at the route layer) ──────

export const BUTTON_MODULES = ['lead', 'contact', 'account', 'deal', 'quote', 'ticket'] as const;
export type ButtonModule = (typeof BUTTON_MODULES)[number];

export const BUTTON_PLACEMENTS = ['RECORD', 'LIST', 'BOTH'] as const;
export type ButtonPlacement = (typeof BUTTON_PLACEMENTS)[number];

export const BUTTON_ACTION_TYPES = [
  'RUN_WORKFLOW',
  'UPDATE_FIELDS',
  'OPEN_URL',
  'CALL_WEBHOOK',
] as const;
export type ButtonActionType = (typeof BUTTON_ACTION_TYPES)[number];

export const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type WebhookMethod = (typeof WEBHOOK_METHODS)[number];

export interface CreateButtonInput {
  module: ButtonModule;
  label: string;
  icon?: string;
  placement?: ButtonPlacement;
  actionType: ButtonActionType;
  config: Record<string, unknown>;
  visibilityRoles?: string[];
  confirmRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateButtonInput {
  label?: string;
  icon?: string | null;
  placement?: ButtonPlacement;
  actionType?: ButtonActionType;
  config?: Record<string, unknown>;
  visibilityRoles?: string[];
  confirmRequired?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

// ─── Execution result (discriminated by actionType) ───────────────────────────

export type ExecuteResult =
  | {
      actionType: 'UPDATE_FIELDS';
      status: 'RESOLVED';
      // Field updates the caller/CRM should apply to the record.
      updates: Record<string, unknown>;
    }
  | {
      actionType: 'RUN_WORKFLOW';
      status: 'EVENT_EMITTED' | 'EVENT_SKIPPED';
      workflowId: string;
      eventType: string;
    }
  | {
      actionType: 'OPEN_URL';
      status: 'RESOLVED';
      url: string;
    }
  | {
      actionType: 'CALL_WEBHOOK';
      status: 'DELIVERED' | 'FAILED' | 'BLOCKED';
      httpStatus?: number;
      url: string;
      detail?: string;
    };

// ─── SSRF guard (metadata-service local; https-only + private-IP block) ───────

const PRIVATE_IP_RE = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^::$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

/** Resolve the host and confirm it is https and not a private/loopback address. */
async function assertPublicHttpsUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('webhook url is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new ValidationError('webhook url must use https');
  }
  let address: string;
  try {
    ({ address } = await lookup(parsed.hostname));
  } catch {
    throw new ValidationError('webhook url host could not be resolved');
  }
  if (PRIVATE_IP_RE.some((re) => re.test(address))) {
    throw new ValidationError('webhook url resolves to a blocked private address');
  }
}

export function createCustomButtonsService(
  prisma: MetadataPrisma,
  deps?: { emitEvent?: (type: string, tenantId: string, payload: Record<string, unknown>) => Promise<void> },
) {
  async function loadOrThrow(tenantId: string, id: string): Promise<CustomButton> {
    const row = await prisma.customButton.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('CustomButton', id);
    return row;
  }

  return {
    async list(tenantId: string, filters?: { module?: string; placement?: string }): Promise<CustomButton[]> {
      return prisma.customButton.findMany({
        where: {
          tenantId,
          ...(filters?.module ? { module: filters.module } : {}),
          ...(filters?.placement ? { placement: filters.placement } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    },

    async getById(tenantId: string, id: string): Promise<CustomButton> {
      return loadOrThrow(tenantId, id);
    },

    async create(tenantId: string, data: CreateButtonInput): Promise<CustomButton> {
      return prisma.customButton.create({
        data: {
          tenantId,
          module: data.module,
          label: data.label,
          icon: data.icon ?? null,
          placement: data.placement ?? 'RECORD',
          actionType: data.actionType,
          config: data.config as Prisma.InputJsonValue,
          visibilityRoles: data.visibilityRoles ?? [],
          confirmRequired: data.confirmRequired ?? false,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    },

    async update(tenantId: string, id: string, data: UpdateButtonInput): Promise<CustomButton> {
      await loadOrThrow(tenantId, id);
      const update: Prisma.CustomButtonUpdateInput = {};
      if (data.label !== undefined) update.label = data.label;
      if (data.icon !== undefined) update.icon = data.icon;
      if (data.placement !== undefined) update.placement = data.placement;
      if (data.actionType !== undefined) update.actionType = data.actionType;
      if (data.config !== undefined) update.config = data.config as Prisma.InputJsonValue;
      if (data.visibilityRoles !== undefined) update.visibilityRoles = data.visibilityRoles;
      if (data.confirmRequired !== undefined) update.confirmRequired = data.confirmRequired;
      if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      return prisma.customButton.update({ where: { id }, data: update });
    },

    async remove(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.customButton.delete({ where: { id } });
    },

    /**
     * The ordered, role-filtered, active buttons the UI should render for the
     * caller. `placement=BOTH` buttons match both RECORD and LIST requests.
     * A button with an empty `visibilityRoles` is visible to everyone; otherwise
     * the caller must hold at least one of the listed roles.
     */
    async resolve(
      tenantId: string,
      opts: { module: string; placement: ButtonPlacement; roles: string[] },
    ): Promise<CustomButton[]> {
      const rows = await prisma.customButton.findMany({
        where: {
          tenantId,
          module: opts.module,
          isActive: true,
          OR: [{ placement: opts.placement }, { placement: 'BOTH' }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const callerRoles = new Set(opts.roles ?? []);
      return rows.filter(
        (b) => b.visibilityRoles.length === 0 || b.visibilityRoles.some((r) => callerRoles.has(r)),
      );
    },

    /**
     * Execute a button's action server-side where it makes sense. Token
     * substitution ({{record.field}}) is delegated to the injection-safe
     * single-pass helper. Never trusts `config` blindly — each branch re-reads
     * the fields it needs and validates them.
     */
    async execute(
      tenantId: string,
      button: CustomButton,
      ctx: { recordId: string; recordData: Record<string, unknown>; actorId: string },
    ): Promise<ExecuteResult> {
      const config = (button.config ?? {}) as Record<string, unknown>;
      const record = ctx.recordData ?? {};

      switch (button.actionType as ButtonActionType) {
        case 'UPDATE_FIELDS': {
          const rawUpdates = config.updates;
          if (!rawUpdates || typeof rawUpdates !== 'object' || Array.isArray(rawUpdates)) {
            throw new ValidationError('UPDATE_FIELDS config.updates must be an object');
          }
          // Resolve any {{record.field}} tokens embedded in the update values.
          const updates = substituteInJsonValue(rawUpdates, record) as Record<string, unknown>;
          return { actionType: 'UPDATE_FIELDS', status: 'RESOLVED', updates };
        }

        case 'OPEN_URL': {
          const urlTemplate = config.urlTemplate;
          if (typeof urlTemplate !== 'string' || urlTemplate.length === 0) {
            throw new ValidationError('OPEN_URL config.urlTemplate must be a non-empty string');
          }
          const url = substituteRecordTokens(urlTemplate, record);
          return { actionType: 'OPEN_URL', status: 'RESOLVED', url };
        }

        case 'RUN_WORKFLOW': {
          const workflowId = config.workflowId;
          if (typeof workflowId !== 'string' || workflowId.length === 0) {
            throw new ValidationError('RUN_WORKFLOW config.workflowId must be a non-empty string');
          }
          const eventType = 'custom_button.workflow.trigger';
          if (deps?.emitEvent) {
            await deps.emitEvent(eventType, tenantId, {
              workflowId,
              module: button.module,
              buttonId: button.id,
              recordId: ctx.recordId,
              record,
              triggeredBy: ctx.actorId,
            });
            return { actionType: 'RUN_WORKFLOW', status: 'EVENT_EMITTED', workflowId, eventType };
          }
          // No producer wired (e.g. offline / tests): report rather than throw.
          return { actionType: 'RUN_WORKFLOW', status: 'EVENT_SKIPPED', workflowId, eventType };
        }

        case 'CALL_WEBHOOK': {
          const rawUrl = config.url;
          if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
            throw new ValidationError('CALL_WEBHOOK config.url must be a non-empty string');
          }
          const method = ((config.method as string) ?? 'POST').toUpperCase();
          if (!(WEBHOOK_METHODS as readonly string[]).includes(method)) {
            throw new ValidationError('CALL_WEBHOOK config.method is not an allowed HTTP method');
          }
          // The URL template may carry tokens; substitute BEFORE the SSRF check
          // so the guard validates the exact host that will be dialled.
          const url = substituteRecordTokens(rawUrl, record);
          try {
            await assertPublicHttpsUrl(url);
          } catch (err) {
            return {
              actionType: 'CALL_WEBHOOK',
              status: 'BLOCKED',
              url,
              detail: err instanceof Error ? err.message : 'blocked',
            };
          }

          const hasBody = method !== 'GET' && method !== 'DELETE';
          let body: string | undefined;
          if (hasBody && config.bodyTemplate !== undefined) {
            body =
              typeof config.bodyTemplate === 'string'
                ? substituteRecordTokens(config.bodyTemplate, record)
                : JSON.stringify(substituteInJsonValue(config.bodyTemplate, record));
          }

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10_000);
            let res: Response;
            try {
              res = await fetch(url, {
                method,
                headers: {
                  'content-type': 'application/json',
                  'x-nexus-tenant': tenantId,
                  'x-nexus-source': 'metadata-service/custom-button',
                },
                ...(body !== undefined ? { body } : {}),
                signal: controller.signal,
                redirect: 'error',
              });
            } finally {
              clearTimeout(timer);
            }
            return {
              actionType: 'CALL_WEBHOOK',
              status: res.ok ? 'DELIVERED' : 'FAILED',
              httpStatus: res.status,
              url,
            };
          } catch (err) {
            return {
              actionType: 'CALL_WEBHOOK',
              status: 'FAILED',
              url,
              detail: err instanceof Error ? err.message : 'request failed',
            };
          }
        }

        default:
          throw new ValidationError(`Unsupported actionType: ${String(button.actionType)}`);
      }
    },
  };
}

export type CustomButtonsService = ReturnType<typeof createCustomButtonsService>;
