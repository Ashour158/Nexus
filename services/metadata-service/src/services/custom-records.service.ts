import { NotFoundError, ValidationError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { CustomModuleField, CustomRecord } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';
import { validateCustomRecord, type FieldDef } from './custom-record-validator.js';
import { computeFormula } from './formula-engine.js';

export interface ListRecordsQuery {
  page?: number;
  pageSize?: number;
  /** Simple equality filter over data fields: { fieldApiName: value }. */
  filter?: Record<string, unknown>;
}

const MAX_PAGE_SIZE = 200;

function toFieldDef(f: CustomModuleField): FieldDef {
  return { apiName: f.apiName, label: f.label, type: f.type, required: f.required, unique: f.unique, options: f.options };
}

/**
 * Compute every FORMULA field for a record's data map and return a shallow copy
 * with those keys populated. Non-throwing (computeFormula is total).
 */
function withFormulas(data: Record<string, unknown>, fields: CustomModuleField[]): Record<string, unknown> {
  const out = { ...data };
  for (const f of fields) {
    if (String(f.type).toUpperCase() === 'FORMULA') {
      const val = computeFormula(f.formula, out);
      out[f.apiName] = val instanceof Date ? val.toISOString() : val;
    }
  }
  return out;
}

export function createCustomRecordsService(prisma: MetadataPrisma) {
  async function loadModuleOrThrow(tenantId: string, moduleId: string) {
    const mod = await prisma.customModule.findFirst({ where: { id: moduleId, tenantId } });
    if (!mod) throw new NotFoundError('CustomModule', moduleId);
    return mod;
  }
  async function loadRecordOrThrow(tenantId: string, moduleId: string, id: string): Promise<CustomRecord> {
    const rec = await prisma.customRecord.findFirst({ where: { id, tenantId, moduleId } });
    if (!rec) throw new NotFoundError('CustomRecord', id);
    return rec;
  }
  function getFields(tenantId: string, moduleId: string): Promise<CustomModuleField[]> {
    return prisma.customModuleField.findMany({ where: { tenantId, moduleId }, orderBy: { sortOrder: 'asc' } });
  }

  /**
   * DB-level uniqueness probe for `unique` fields. Uses a JSON path equality
   * filter; excludes the record being updated. Fail-open on query error.
   */
  async function assertUnique(
    tenantId: string,
    moduleId: string,
    checks: { apiName: string; value: unknown }[],
    excludeId?: string
  ): Promise<void> {
    for (const { apiName, value } of checks) {
      try {
        const clash = await prisma.customRecord.findFirst({
          where: {
            tenantId,
            moduleId,
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
            data: { path: [apiName], equals: value as Prisma.InputJsonValue },
          },
          select: { id: true },
        });
        if (clash) {
          throw new ValidationError('Record failed validation', {
            issues: [{ field: apiName, message: `${apiName} must be unique; value already exists.` }],
          });
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        // Query problem (e.g. JSON path unsupported) => skip this uniqueness check (fail-open).
      }
    }
  }

  return {
    async listRecords(tenantId: string, moduleId: string, query: ListRecordsQuery = {}) {
      await loadModuleOrThrow(tenantId, moduleId);
      const fields = await getFields(tenantId, moduleId);

      const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? 25) || 25));

      const where: Prisma.CustomRecordWhereInput = { tenantId, moduleId };
      const filter = query.filter && typeof query.filter === 'object' ? query.filter : {};
      const andFilters: Prisma.CustomRecordWhereInput[] = [];
      for (const [key, value] of Object.entries(filter)) {
        if (value === undefined) continue;
        andFilters.push({ data: { path: [key], equals: value as Prisma.InputJsonValue } });
      }
      if (andFilters.length) where.AND = andFilters;

      const [total, rows] = await Promise.all([
        prisma.customRecord.count({ where }),
        prisma.customRecord.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const data = rows.map((r) => ({
        ...r,
        data: withFormulas((r.data as Record<string, unknown>) ?? {}, fields),
      }));

      return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    },

    async getRecord(tenantId: string, moduleId: string, id: string) {
      await loadModuleOrThrow(tenantId, moduleId);
      const fields = await getFields(tenantId, moduleId);
      const rec = await loadRecordOrThrow(tenantId, moduleId, id);
      return { ...rec, data: withFormulas((rec.data as Record<string, unknown>) ?? {}, fields) };
    },

    async createRecord(tenantId: string, moduleId: string, data: Record<string, unknown>, ownerId?: string) {
      await loadModuleOrThrow(tenantId, moduleId);
      const fields = await getFields(tenantId, moduleId);
      const fieldDefs = fields.map(toFieldDef);

      const result = validateCustomRecord(fieldDefs, data ?? {}, { partial: false });
      if (!result.valid) throw new ValidationError('Record failed validation', { issues: result.issues });
      await assertUnique(tenantId, moduleId, result.uniqueChecks);

      const stored = withFormulas(result.coerced, fields);
      const rec = await prisma.customRecord.create({
        data: { tenantId, moduleId, data: stored as Prisma.InputJsonValue, ownerId: ownerId ?? null },
      });
      return { ...rec, data: stored };
    },

    async updateRecord(tenantId: string, moduleId: string, id: string, data: Record<string, unknown>) {
      await loadModuleOrThrow(tenantId, moduleId);
      const fields = await getFields(tenantId, moduleId);
      const fieldDefs = fields.map(toFieldDef);
      const existing = await loadRecordOrThrow(tenantId, moduleId, id);

      const result = validateCustomRecord(fieldDefs, data ?? {}, { partial: true });
      if (!result.valid) throw new ValidationError('Record failed validation', { issues: result.issues });
      await assertUnique(tenantId, moduleId, result.uniqueChecks, id);

      const merged = { ...((existing.data as Record<string, unknown>) ?? {}), ...result.coerced };
      const stored = withFormulas(merged, fields);
      const rec = await prisma.customRecord.update({ where: { id }, data: { data: stored as Prisma.InputJsonValue } });
      return { ...rec, data: stored };
    },

    async deleteRecord(tenantId: string, moduleId: string, id: string): Promise<void> {
      await loadModuleOrThrow(tenantId, moduleId);
      await loadRecordOrThrow(tenantId, moduleId, id);
      await prisma.customRecord.delete({ where: { id } });
    },
  };
}

export type CustomRecordsService = ReturnType<typeof createCustomRecordsService>;
