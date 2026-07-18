import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { LayoutRule, PageLayout } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import {
  evaluateLayoutRules,
  LAYOUT_ACTION_TYPES,
  LAYOUT_RULE_OPERATORS,
  type EvaluableLayoutRule,
  type LayoutDirectives,
} from './layout-rules.js';
import { buildLayoutMeta, type LayoutBuilderMeta } from './layout-meta.js';

export interface LayoutSection {
  id?: string;
  title?: string;
  columns?: number;
  fields?: string[];
  [k: string]: unknown;
}
export interface CreateLayoutInput {
  module: string;
  name: string;
  isDefault?: boolean;
  assignedProfiles?: string[];
  sections?: LayoutSection[];
  isActive?: boolean;
}
export type UpdateLayoutInput = Partial<Omit<CreateLayoutInput, 'module'>>;

export interface CreateRuleInput {
  name: string;
  triggerField: string;
  operator: string;
  triggerValue?: unknown;
  actions?: { type: string; target: string }[];
  position?: number;
  isActive?: boolean;
}
export type UpdateRuleInput = Partial<CreateRuleInput>;

export function createPageLayoutsService(prisma: MetadataPrisma) {
  async function loadLayout(tenantId: string, id: string): Promise<PageLayout> {
    const row = await prisma.pageLayout.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('PageLayout', id);
    return row;
  }
  async function loadRule(tenantId: string, layoutId: string, id: string): Promise<LayoutRule> {
    const row = await prisma.layoutRule.findFirst({ where: { id, tenantId, layoutId } });
    if (!row) throw new NotFoundError('LayoutRule', id);
    return row;
  }

  return {
    // ── Layouts ────────────────────────────────────────────────────────────────
    async listLayouts(tenantId: string, module?: string): Promise<PageLayout[]> {
      return prisma.pageLayout.findMany({
        where: { tenantId, ...(module ? { module } : {}) },
        orderBy: [{ module: 'asc' }, { createdAt: 'asc' }],
      });
    },

    async getLayout(tenantId: string, id: string): Promise<PageLayout> {
      return loadLayout(tenantId, id);
    },

    async createLayout(tenantId: string, data: CreateLayoutInput): Promise<PageLayout> {
      const sections = Array.isArray(data.sections) ? data.sections : [];
      // Enforce a single default per (tenant, module).
      if (data.isDefault) {
        await prisma.pageLayout.updateMany({
          where: { tenantId, module: data.module, isDefault: true },
          data: { isDefault: false },
        });
      }
      return prisma.pageLayout.create({
        data: {
          tenantId,
          module: data.module,
          name: data.name,
          isDefault: data.isDefault ?? false,
          assignedProfiles: data.assignedProfiles ?? [],
          sections: sections as unknown as Prisma.InputJsonValue,
          isActive: data.isActive ?? true,
        },
      });
    },

    async updateLayout(tenantId: string, id: string, data: UpdateLayoutInput): Promise<PageLayout> {
      const existing = await loadLayout(tenantId, id);
      if (data.isDefault) {
        await prisma.pageLayout.updateMany({
          where: { tenantId, module: existing.module, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      const update: Prisma.PageLayoutUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.isDefault !== undefined) update.isDefault = data.isDefault;
      if (data.assignedProfiles !== undefined) update.assignedProfiles = data.assignedProfiles;
      if (data.sections !== undefined) {
        update.sections = (Array.isArray(data.sections) ? data.sections : []) as unknown as Prisma.InputJsonValue;
      }
      if (data.isActive !== undefined) update.isActive = data.isActive;
      return prisma.pageLayout.update({ where: { id }, data: update });
    },

    async deleteLayout(tenantId: string, id: string): Promise<void> {
      await loadLayout(tenantId, id);
      // Rules cascade at the DB level (onDelete: Cascade), but clear explicitly
      // too so a tenant-scoped delete is deterministic regardless of FK setup.
      await prisma.layoutRule.deleteMany({ where: { tenantId, layoutId: id } });
      await prisma.pageLayout.delete({ where: { id } });
    },

    /**
     * Resolve the layout the caller should see for `module`: the first active
     * layout assigned to any of the caller's roles, else the module default,
     * else null (UI falls back to its static layout). Deterministic ordering.
     */
    async resolveLayout(tenantId: string, module: string, roles: string[]): Promise<PageLayout | null> {
      const layouts = await prisma.pageLayout.findMany({
        where: { tenantId, module, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (layouts.length === 0) return null;
      const roleSet = new Set((roles ?? []).map((r) => String(r)));
      const assigned = layouts.find(
        (l) => Array.isArray(l.assignedProfiles) && l.assignedProfiles.some((p) => roleSet.has(p))
      );
      if (assigned) return assigned;
      const dflt = layouts.find((l) => l.isDefault);
      return dflt ?? layouts[0];
    },

    // ── Layout Rules ───────────────────────────────────────────────────────────
    async listRules(tenantId: string, layoutId: string): Promise<LayoutRule[]> {
      await loadLayout(tenantId, layoutId);
      return prisma.layoutRule.findMany({
        where: { tenantId, layoutId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    },

    async getRule(tenantId: string, layoutId: string, id: string): Promise<LayoutRule> {
      return loadRule(tenantId, layoutId, id);
    },

    async createRule(tenantId: string, layoutId: string, data: CreateRuleInput): Promise<LayoutRule> {
      await loadLayout(tenantId, layoutId);
      return prisma.layoutRule.create({
        data: {
          tenantId,
          layoutId,
          name: data.name,
          triggerField: data.triggerField,
          operator: data.operator,
          triggerValue: (data.triggerValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          actions: (Array.isArray(data.actions) ? data.actions : []) as unknown as Prisma.InputJsonValue,
          position: data.position ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    },

    async updateRule(tenantId: string, layoutId: string, id: string, data: UpdateRuleInput): Promise<LayoutRule> {
      await loadRule(tenantId, layoutId, id);
      const update: Prisma.LayoutRuleUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.triggerField !== undefined) update.triggerField = data.triggerField;
      if (data.operator !== undefined) update.operator = data.operator;
      if (data.triggerValue !== undefined) {
        update.triggerValue = (data.triggerValue ?? Prisma.JsonNull) as Prisma.InputJsonValue;
      }
      if (data.actions !== undefined) {
        update.actions = (Array.isArray(data.actions) ? data.actions : []) as unknown as Prisma.InputJsonValue;
      }
      if (data.position !== undefined) update.position = data.position;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      return prisma.layoutRule.update({ where: { id }, data: update });
    },

    async deleteRule(tenantId: string, layoutId: string, id: string): Promise<void> {
      await loadRule(tenantId, layoutId, id);
      await prisma.layoutRule.delete({ where: { id } });
    },

    /**
     * Apply all active rules of a layout to a record's field values and return
     * the resolved UI directives. Total + deterministic (never throws).
     */
    async evaluate(tenantId: string, layoutId: string, record: Record<string, unknown>): Promise<LayoutDirectives> {
      await loadLayout(tenantId, layoutId);
      const rules = await prisma.layoutRule.findMany({
        where: { tenantId, layoutId, isActive: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      const evaluable: EvaluableLayoutRule[] = rules.map((r) => ({
        triggerField: r.triggerField,
        operator: r.operator,
        triggerValue: r.triggerValue,
        actions: r.actions,
        isActive: r.isActive,
        position: r.position,
      }));
      return evaluateLayoutRules(evaluable, record);
    },

    // ── Builder metadata (backs the visual layout editor) ───────────────────────
    async getMeta(tenantId: string): Promise<LayoutBuilderMeta> {
      const [customFields, customModules, customModuleFields] = await Promise.all([
        prisma.customFieldDefinition.findMany({
          where: { tenantId, isActive: true },
          orderBy: [{ entityType: 'asc' }, { position: 'asc' }],
        }),
        prisma.customModule.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
        prisma.customModuleField.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
      ]);
      return buildLayoutMeta({
        customFields,
        customModules,
        customModuleFields,
        operators: [...LAYOUT_RULE_OPERATORS],
        actionTypes: [...LAYOUT_ACTION_TYPES],
      });
    },
  };
}

export type PageLayoutsService = ReturnType<typeof createPageLayoutsService>;
