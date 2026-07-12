import type { DataPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/data-client/index.js';

/** One column→field rule inside a template's `mappings` array. */
export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  transform?: string;
}

export interface TemplateInput {
  name: string;
  module: string;
  mappings: ColumnMapping[];
}

/**
 * Flatten a template's ordered `mappings` array into the two structures the
 * import pipeline consumes:
 *   - `fieldMap`   : `{ [sourceColumn]: targetField }` (persisted on ImportJob)
 *   - `transforms` : `{ [targetField]: transform }`   (passed to processJob)
 *
 * Rows missing either column are skipped defensively so a malformed template can
 * never crash an import.
 */
export function resolveMappings(mappings: unknown): {
  fieldMap: Record<string, string>;
  transforms: Record<string, string>;
} {
  const fieldMap: Record<string, string> = {};
  const transforms: Record<string, string> = {};
  if (Array.isArray(mappings)) {
    for (const raw of mappings) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Partial<ColumnMapping>;
      if (typeof m.sourceColumn !== 'string' || typeof m.targetField !== 'string') continue;
      fieldMap[m.sourceColumn] = m.targetField;
      if (typeof m.transform === 'string' && m.transform.trim()) {
        transforms[m.targetField] = m.transform.trim();
      }
    }
  }
  return { fieldMap, transforms };
}

export function createMappingTemplateService(prisma: DataPrisma) {
  return {
    async create(tenantId: string, createdBy: string, input: TemplateInput) {
      return prisma.importMappingTemplate.create({
        data: {
          tenantId,
          createdBy,
          name: input.name,
          module: input.module,
          mappings: input.mappings as unknown as Prisma.InputJsonValue,
        },
      });
    },

    async list(tenantId: string, module: string | undefined, page: number, limit: number) {
      const where = { tenantId, ...(module ? { module } : {}) };
      const [data, total] = await Promise.all([
        prisma.importMappingTemplate.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.importMappingTemplate.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    async get(tenantId: string, id: string) {
      return prisma.importMappingTemplate.findFirst({ where: { id, tenantId } });
    },

    async update(tenantId: string, id: string, patch: Partial<TemplateInput>) {
      const existing = await prisma.importMappingTemplate.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      return prisma.importMappingTemplate.update({
        where: { id: existing.id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.module !== undefined ? { module: patch.module } : {}),
          ...(patch.mappings !== undefined
            ? { mappings: patch.mappings as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
    },

    async remove(tenantId: string, id: string) {
      const existing = await prisma.importMappingTemplate.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      return prisma.importMappingTemplate.delete({ where: { id: existing.id } });
    },
  };
}
