import { ConflictError, NotFoundError, ValidationError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type {
  CustomModule,
  CustomModuleField,
  CustomModuleLayout,
} from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import { CUSTOM_FIELD_TYPES } from './custom-record-validator.js';

const P2002 = 'P2002';

/** apiName must be a safe identifier (matches the custom-field convention). */
const API_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const FIELD_TYPE_SET = new Set<string>(CUSTOM_FIELD_TYPES as readonly string[]);

export interface CreateModuleInput {
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  isActive?: boolean;
}
export interface UpdateModuleInput {
  label?: string;
  pluralLabel?: string;
  description?: string;
  icon?: string;
  isActive?: boolean;
}
export interface CreateFieldInput {
  apiName: string;
  label: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  options?: unknown;
  formula?: string;
  lookupModule?: string;
  defaultValue?: unknown;
  sortOrder?: number;
}
export type UpdateFieldInput = Partial<CreateFieldInput>;
export interface LayoutSection {
  title?: string;
  columns?: number;
  fields?: string[];
}
export interface CreateLayoutInput {
  name: string;
  sections: LayoutSection[];
  isDefault?: boolean;
}
export type UpdateLayoutInput = Partial<CreateLayoutInput>;

function validateFieldShape(data: Partial<CreateFieldInput>, partial: boolean): string[] {
  const issues: string[] = [];
  if (data.apiName !== undefined || !partial) {
    if (typeof data.apiName !== 'string' || !API_NAME_RE.test(data.apiName)) {
      issues.push('apiName must start with a letter and contain only letters, digits, or underscores.');
    }
  }
  if (data.type !== undefined || !partial) {
    const t = String(data.type ?? '').toUpperCase();
    if (!FIELD_TYPE_SET.has(t)) {
      issues.push(`type must be one of: ${(CUSTOM_FIELD_TYPES as readonly string[]).join(', ')}.`);
    }
    if (t === 'FORMULA' && data.formula !== undefined && typeof data.formula !== 'string') {
      issues.push('formula must be a string.');
    }
  }
  return issues;
}

export function createCustomModulesService(prisma: MetadataPrisma) {
  async function loadModule(tenantId: string, id: string): Promise<CustomModule> {
    const row = await prisma.customModule.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('CustomModule', id);
    return row;
  }
  async function loadField(tenantId: string, moduleId: string, id: string): Promise<CustomModuleField> {
    const row = await prisma.customModuleField.findFirst({ where: { id, tenantId, moduleId } });
    if (!row) throw new NotFoundError('CustomModuleField', id);
    return row;
  }
  async function loadLayout(tenantId: string, moduleId: string, id: string): Promise<CustomModuleLayout> {
    const row = await prisma.customModuleLayout.findFirst({ where: { id, tenantId, moduleId } });
    if (!row) throw new NotFoundError('CustomModuleLayout', id);
    return row;
  }

  return {
    // ── Modules ──────────────────────────────────────────────────────────────
    async listModules(tenantId: string): Promise<CustomModule[]> {
      return prisma.customModule.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    },
    async getModule(tenantId: string, id: string): Promise<CustomModule> {
      return loadModule(tenantId, id);
    },
    async createModule(tenantId: string, data: CreateModuleInput): Promise<CustomModule> {
      if (typeof data.apiName !== 'string' || !API_NAME_RE.test(data.apiName)) {
        throw new ValidationError('Invalid module', { issues: ['apiName must start with a letter and contain only letters, digits, or underscores.'] });
      }
      try {
        return await prisma.customModule.create({
          data: {
            tenantId,
            apiName: data.apiName,
            label: data.label,
            pluralLabel: data.pluralLabel,
            description: data.description ?? null,
            icon: data.icon ?? null,
            isActive: data.isActive ?? true,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('CustomModule', 'apiName');
        }
        throw err;
      }
    },
    async updateModule(tenantId: string, id: string, data: UpdateModuleInput): Promise<CustomModule> {
      await loadModule(tenantId, id);
      const update: Prisma.CustomModuleUpdateInput = {};
      if (data.label !== undefined) update.label = data.label;
      if (data.pluralLabel !== undefined) update.pluralLabel = data.pluralLabel;
      if (data.description !== undefined) update.description = data.description;
      if (data.icon !== undefined) update.icon = data.icon;
      if (data.isActive !== undefined) update.isActive = data.isActive;
      return prisma.customModule.update({ where: { id }, data: update });
    },
    async deleteModule(tenantId: string, id: string): Promise<void> {
      await loadModule(tenantId, id);
      // Cascade delete children (no DB-level FK cascade defined; do it explicitly).
      await prisma.customModuleField.deleteMany({ where: { tenantId, moduleId: id } });
      await prisma.customModuleLayout.deleteMany({ where: { tenantId, moduleId: id } });
      await prisma.customRecord.deleteMany({ where: { tenantId, moduleId: id } });
      await prisma.customModule.delete({ where: { id } });
    },

    // ── Fields ───────────────────────────────────────────────────────────────
    async listFields(tenantId: string, moduleId: string): Promise<CustomModuleField[]> {
      await loadModule(tenantId, moduleId);
      return prisma.customModuleField.findMany({ where: { tenantId, moduleId }, orderBy: { sortOrder: 'asc' } });
    },
    async addField(tenantId: string, moduleId: string, data: CreateFieldInput): Promise<CustomModuleField> {
      await loadModule(tenantId, moduleId);
      const issues = validateFieldShape(data, false);
      if (issues.length) throw new ValidationError('Invalid field', { issues });
      try {
        return await prisma.customModuleField.create({
          data: {
            tenantId,
            moduleId,
            apiName: data.apiName,
            label: data.label,
            type: String(data.type).toUpperCase(),
            required: data.required ?? false,
            unique: data.unique ?? false,
            options: (data.options ?? undefined) as Prisma.InputJsonValue | undefined,
            formula: data.formula ?? null,
            lookupModule: data.lookupModule ?? null,
            defaultValue: (data.defaultValue ?? undefined) as Prisma.InputJsonValue | undefined,
            sortOrder: data.sortOrder ?? 0,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('CustomModuleField', 'apiName');
        }
        throw err;
      }
    },
    async updateField(tenantId: string, moduleId: string, id: string, data: UpdateFieldInput): Promise<CustomModuleField> {
      await loadField(tenantId, moduleId, id);
      const issues = validateFieldShape(data, true);
      if (issues.length) throw new ValidationError('Invalid field', { issues });
      const update: Prisma.CustomModuleFieldUpdateInput = {};
      if (data.apiName !== undefined) update.apiName = data.apiName;
      if (data.label !== undefined) update.label = data.label;
      if (data.type !== undefined) update.type = String(data.type).toUpperCase();
      if (data.required !== undefined) update.required = data.required;
      if (data.unique !== undefined) update.unique = data.unique;
      if (data.options !== undefined) update.options = data.options as Prisma.InputJsonValue;
      if (data.formula !== undefined) update.formula = data.formula;
      if (data.lookupModule !== undefined) update.lookupModule = data.lookupModule;
      if (data.defaultValue !== undefined) update.defaultValue = data.defaultValue as Prisma.InputJsonValue;
      if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
      try {
        return await prisma.customModuleField.update({ where: { id }, data: update });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('CustomModuleField', 'apiName');
        }
        throw err;
      }
    },
    async removeField(tenantId: string, moduleId: string, id: string): Promise<void> {
      await loadField(tenantId, moduleId, id);
      await prisma.customModuleField.delete({ where: { id } });
    },
    /** Reorder fields: apply the given [{ id, sortOrder }] within one module. */
    async reorderFields(tenantId: string, moduleId: string, order: { id: string; sortOrder: number }[]): Promise<CustomModuleField[]> {
      await loadModule(tenantId, moduleId);
      const ids = order.map((o) => o.id);
      const existing = await prisma.customModuleField.findMany({ where: { tenantId, moduleId, id: { in: ids } } });
      const existingIds = new Set(existing.map((f) => f.id));
      await prisma.$transaction(
        order
          .filter((o) => existingIds.has(o.id) && Number.isFinite(o.sortOrder))
          .map((o) => prisma.customModuleField.update({ where: { id: o.id }, data: { sortOrder: o.sortOrder } }))
      );
      return prisma.customModuleField.findMany({ where: { tenantId, moduleId }, orderBy: { sortOrder: 'asc' } });
    },

    // ── Layouts ──────────────────────────────────────────────────────────────
    async listLayouts(tenantId: string, moduleId: string): Promise<CustomModuleLayout[]> {
      await loadModule(tenantId, moduleId);
      return prisma.customModuleLayout.findMany({ where: { tenantId, moduleId }, orderBy: { createdAt: 'asc' } });
    },
    async getLayout(tenantId: string, moduleId: string, id: string): Promise<CustomModuleLayout> {
      return loadLayout(tenantId, moduleId, id);
    },
    async createLayout(tenantId: string, moduleId: string, data: CreateLayoutInput): Promise<CustomModuleLayout> {
      await loadModule(tenantId, moduleId);
      const sections = Array.isArray(data.sections) ? data.sections : [];
      if (data.isDefault) {
        await prisma.customModuleLayout.updateMany({ where: { tenantId, moduleId, isDefault: true }, data: { isDefault: false } });
      }
      return prisma.customModuleLayout.create({
        data: {
          tenantId,
          moduleId,
          name: data.name,
          sections: sections as unknown as Prisma.InputJsonValue,
          isDefault: data.isDefault ?? false,
        },
      });
    },
    async updateLayout(tenantId: string, moduleId: string, id: string, data: UpdateLayoutInput): Promise<CustomModuleLayout> {
      await loadLayout(tenantId, moduleId, id);
      if (data.isDefault) {
        await prisma.customModuleLayout.updateMany({ where: { tenantId, moduleId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
      }
      const update: Prisma.CustomModuleLayoutUpdateInput = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.sections !== undefined) update.sections = (Array.isArray(data.sections) ? data.sections : []) as unknown as Prisma.InputJsonValue;
      if (data.isDefault !== undefined) update.isDefault = data.isDefault;
      return prisma.customModuleLayout.update({ where: { id }, data: update });
    },
    async deleteLayout(tenantId: string, moduleId: string, id: string): Promise<void> {
      await loadLayout(tenantId, moduleId, id);
      await prisma.customModuleLayout.delete({ where: { id } });
    },
  };
}

export type CustomModulesService = ReturnType<typeof createCustomModulesService>;
