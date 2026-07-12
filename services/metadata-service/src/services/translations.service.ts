import { ConflictError, NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { LabelTranslation } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

/**
 * Label localization: per-tenant translations that override the BASE label of a
 * custom field, custom module, or picklist value for a given locale. The UI
 * merges the resolved key→value map over its base labels; a missing key falls
 * back to the base label, so a tenant with no translations behaves exactly as
 * today.
 */

const P2002 = 'P2002';

/** Translatable entity kinds. `entityKey` is an opaque UI-chosen identifier. */
export const TRANSLATION_ENTITY_TYPES = ['field', 'module', 'picklistValue'] as const;
export type TranslationEntityType = (typeof TRANSLATION_ENTITY_TYPES)[number];

export interface CreateTranslationInput {
  entityType: TranslationEntityType;
  entityKey: string;
  locale: string;
  value: string;
}
export interface UpdateTranslationInput {
  value: string;
}
export interface ListTranslationFilter {
  entityType?: TranslationEntityType;
  locale?: string;
  entityKey?: string;
}

export function createTranslationsService(prisma: MetadataPrisma) {
  async function loadOrThrow(tenantId: string, id: string): Promise<LabelTranslation> {
    const row = await prisma.labelTranslation.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('LabelTranslation', id);
    return row;
  }

  return {
    async list(tenantId: string, filter: ListTranslationFilter = {}): Promise<LabelTranslation[]> {
      return prisma.labelTranslation.findMany({
        where: {
          tenantId,
          ...(filter.entityType ? { entityType: filter.entityType } : {}),
          ...(filter.locale ? { locale: filter.locale } : {}),
          ...(filter.entityKey ? { entityKey: filter.entityKey } : {}),
        },
        orderBy: [{ entityType: 'asc' }, { entityKey: 'asc' }, { locale: 'asc' }],
      });
    },

    async get(tenantId: string, id: string): Promise<LabelTranslation> {
      return loadOrThrow(tenantId, id);
    },

    async create(tenantId: string, data: CreateTranslationInput): Promise<LabelTranslation> {
      try {
        return await prisma.labelTranslation.create({
          data: {
            tenantId,
            entityType: data.entityType,
            entityKey: data.entityKey,
            locale: data.locale,
            value: data.value,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === P2002) {
          throw new ConflictError('LabelTranslation', 'entityType+entityKey+locale');
        }
        throw err;
      }
    },

    async update(tenantId: string, id: string, data: UpdateTranslationInput): Promise<LabelTranslation> {
      await loadOrThrow(tenantId, id);
      return prisma.labelTranslation.update({ where: { id }, data: { value: data.value } });
    },

    /**
     * Upsert by natural key (tenant, entityType, entityKey, locale). Lets callers
     * (and config-import flows) set a translation without first checking for one.
     */
    async upsert(tenantId: string, data: CreateTranslationInput): Promise<LabelTranslation> {
      return prisma.labelTranslation.upsert({
        where: {
          tenantId_entityType_entityKey_locale: {
            tenantId,
            entityType: data.entityType,
            entityKey: data.entityKey,
            locale: data.locale,
          },
        },
        create: {
          tenantId,
          entityType: data.entityType,
          entityKey: data.entityKey,
          locale: data.locale,
          value: data.value,
        },
        update: { value: data.value },
      });
    },

    async remove(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.labelTranslation.delete({ where: { id } });
    },

    /**
     * Resolve a locale into a flat { entityKey: value } map for one entityType
     * (or all types when `entityType` is omitted, keyed by `entityType:entityKey`).
     * Only configured overrides appear; the UI keeps its base label for anything
     * absent — so unconfigured == today's behavior.
     */
    async resolve(
      tenantId: string,
      locale: string,
      entityType?: TranslationEntityType
    ): Promise<{ locale: string; entityType: TranslationEntityType | null; translations: Record<string, string> }> {
      const rows = await prisma.labelTranslation.findMany({
        where: { tenantId, locale, ...(entityType ? { entityType } : {}) },
      });
      const translations: Record<string, string> = {};
      for (const r of rows) {
        const key = entityType ? r.entityKey : `${r.entityType}:${r.entityKey}`;
        translations[key] = r.value;
      }
      return { locale, entityType: entityType ?? null, translations };
    },
  };
}

export type TranslationsService = ReturnType<typeof createTranslationsService>;
