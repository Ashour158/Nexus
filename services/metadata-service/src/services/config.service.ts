import { ValidationError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

/**
 * Config-as-data: export/import a tenant's low-code customization bundle.
 *
 * The bundle is a single versioned JSON document that captures every
 * customization this service owns. Import ALWAYS rebinds rows to the CALLING
 * tenant — the source `tenantId` in the bundle is informational only and is
 * never written. Cross-entity references (a custom field → global set, a
 * module field → its module, a layout rule → its layout) travel as natural
 * keys (names / api-names), so ids never leak across environments. APPLY runs
 * in one interactive transaction and is idempotent: re-importing an unchanged
 * bundle writes nothing (every entity resolves to `skip`).
 */

export const BUNDLE_VERSION = '1.0';

/** Top-level entity groups a caller may include/exclude via `?include=`. */
export const CONFIG_ENTITY_GROUPS = [
  'globalPicklistSets',
  'customFields',
  'customModules',
  'pageLayouts',
  'relatedLists',
  'validationRules',
] as const;
export type ConfigEntityGroup = (typeof CONFIG_ENTITY_GROUPS)[number];

export type ImportMode = 'DRY_RUN' | 'APPLY';
export type ConflictStrategy = 'SKIP' | 'OVERWRITE';

// ── Bundle shapes ────────────────────────────────────────────────────────────
interface BundleGlobalSet {
  name: string;
  options: unknown;
  isActive: boolean;
}
interface BundleCustomField {
  entityType: string;
  name: string;
  apiKey: string;
  fieldType: string;
  options: unknown;
  config: unknown | null;
  // Rebound natural key of the referenced GlobalPicklistSet (or null).
  globalSetName: string | null;
  required: boolean;
  showOnCard: boolean;
  position: number;
  isActive: boolean;
}
interface BundleModuleField {
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  unique: boolean;
  options: unknown | null;
  formula: string | null;
  lookupModule: string | null;
  defaultValue: unknown | null;
  sortOrder: number;
}
interface BundleModuleLayout {
  name: string;
  sections: unknown;
  isDefault: boolean;
}
interface BundleCustomModule {
  apiName: string;
  label: string;
  pluralLabel: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  fields: BundleModuleField[];
  layouts: BundleModuleLayout[];
}
interface BundleLayoutRule {
  name: string;
  triggerField: string;
  operator: string;
  triggerValue: unknown | null;
  actions: unknown;
  position: number;
  isActive: boolean;
}
interface BundlePageLayout {
  module: string;
  name: string;
  isDefault: boolean;
  assignedProfiles: string[];
  sections: unknown;
  isActive: boolean;
  rules: BundleLayoutRule[];
}
interface BundleRelatedList {
  module: string;
  name: string;
  relatedModule: string;
  displayFields: string[];
  sortBy: string | null;
  visibleToProfiles: string[];
  sortOrder: number;
  isActive: boolean;
}
interface BundleValidationRule {
  objectType: string;
  name: string;
  condition: unknown;
  requirement: unknown;
  errorMessage: string;
  isActive: boolean;
}

export interface ConfigBundle {
  version: string;
  exportedAt: string;
  /** SOURCE tenant — informational only; NEVER written on import. */
  tenantId: string;
  entities: {
    globalPicklistSets?: BundleGlobalSet[];
    customFields?: BundleCustomField[];
    customModules?: BundleCustomModule[];
    pageLayouts?: BundlePageLayout[];
    relatedLists?: BundleRelatedList[];
    validationRules?: BundleValidationRule[];
  };
}

type Action = 'create' | 'update' | 'skip';
interface GroupDiff {
  create: string[];
  update: string[];
  skip: string[];
}
export interface ImportDiff {
  [group: string]: GroupDiff;
}
export interface ImportSummary {
  mode: ImportMode;
  conflict: ConflictStrategy;
  bundleVersion: string;
  sourceTenantId: string | null;
  totals: { created: number; updated: number; skipped: number };
  diff: ImportDiff;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic JSON with recursively sorted object keys (for deep equality). */
function stable(value: unknown): string {
  return JSON.stringify(value, function replacer(this: unknown, _k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {} as Record<string, unknown>);
    }
    return v;
  });
}
function equalContent(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}
function emptyDiff(): GroupDiff {
  return { create: [], update: [], skip: [] };
}
const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
const asNullableJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

export function createConfigService(prisma: MetadataPrisma) {
  // ── EXPORT ─────────────────────────────────────────────────────────────────
  async function exportConfig(tenantId: string, include: ConfigEntityGroup[]): Promise<ConfigBundle> {
    const want = new Set(include);
    const entities: ConfigBundle['entities'] = {};

    // Global sets first — needed to rebind custom-field references to names.
    const sets = await prisma.globalPicklistSet.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    const setIdToName = new Map(sets.map((s) => [s.id, s.name]));

    if (want.has('globalPicklistSets')) {
      entities.globalPicklistSets = sets.map((s) => ({
        name: s.name,
        options: s.options,
        isActive: s.isActive,
      }));
    }

    if (want.has('customFields')) {
      const fields = await prisma.customFieldDefinition.findMany({
        where: { tenantId },
        orderBy: [{ entityType: 'asc' }, { position: 'asc' }, { apiKey: 'asc' }],
      });
      entities.customFields = fields.map((f) => ({
        entityType: f.entityType,
        name: f.name,
        apiKey: f.apiKey,
        fieldType: f.fieldType,
        options: f.options,
        config: f.config ?? null,
        globalSetName: f.globalSetId ? setIdToName.get(f.globalSetId) ?? null : null,
        required: f.required,
        showOnCard: f.showOnCard,
        position: f.position,
        isActive: f.isActive,
      }));
    }

    if (want.has('customModules')) {
      const [modules, mFields, mLayouts] = await Promise.all([
        prisma.customModule.findMany({ where: { tenantId }, orderBy: { apiName: 'asc' } }),
        prisma.customModuleField.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } }),
        prisma.customModuleLayout.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      ]);
      entities.customModules = modules.map((m) => ({
        apiName: m.apiName,
        label: m.label,
        pluralLabel: m.pluralLabel,
        description: m.description ?? null,
        icon: m.icon ?? null,
        isActive: m.isActive,
        fields: mFields
          .filter((f) => f.moduleId === m.id)
          .map((f) => ({
            apiName: f.apiName,
            label: f.label,
            type: f.type,
            required: f.required,
            unique: f.unique,
            options: f.options ?? null,
            formula: f.formula ?? null,
            lookupModule: f.lookupModule ?? null,
            defaultValue: f.defaultValue ?? null,
            sortOrder: f.sortOrder,
          })),
        layouts: mLayouts
          .filter((l) => l.moduleId === m.id)
          .map((l) => ({ name: l.name, sections: l.sections, isDefault: l.isDefault })),
      }));
    }

    if (want.has('pageLayouts')) {
      const [layouts, rules] = await Promise.all([
        prisma.pageLayout.findMany({ where: { tenantId }, orderBy: [{ module: 'asc' }, { name: 'asc' }] }),
        prisma.layoutRule.findMany({ where: { tenantId }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      ]);
      entities.pageLayouts = layouts.map((l) => ({
        module: l.module,
        name: l.name,
        isDefault: l.isDefault,
        assignedProfiles: l.assignedProfiles,
        sections: l.sections,
        isActive: l.isActive,
        rules: rules
          .filter((r) => r.layoutId === l.id)
          .map((r) => ({
            name: r.name,
            triggerField: r.triggerField,
            operator: r.operator,
            triggerValue: r.triggerValue ?? null,
            actions: r.actions,
            position: r.position,
            isActive: r.isActive,
          })),
      }));
    }

    if (want.has('relatedLists')) {
      const rows = await prisma.relatedListConfig.findMany({
        where: { tenantId },
        orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });
      entities.relatedLists = rows.map((r) => ({
        module: r.module,
        name: r.name,
        relatedModule: r.relatedModule,
        displayFields: r.displayFields,
        sortBy: r.sortBy ?? null,
        visibleToProfiles: r.visibleToProfiles,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
      }));
    }

    if (want.has('validationRules')) {
      const rows = await prisma.validationRule.findMany({ where: { tenantId }, orderBy: [{ objectType: 'asc' }, { name: 'asc' }] });
      entities.validationRules = rows.map((r) => ({
        objectType: r.objectType,
        name: r.name,
        condition: r.condition,
        requirement: r.requirement,
        errorMessage: r.errorMessage,
        isActive: r.isActive,
      }));
    }

    return { version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), tenantId, entities };
  }

  // ── IMPORT ───────────────────────────────────────────────────────────────
  async function importConfig(
    tenantId: string,
    opts: { bundle: ConfigBundle; mode: ImportMode; conflict: ConflictStrategy }
  ): Promise<ImportSummary> {
    const { bundle, mode, conflict } = opts;
    if (!bundle || typeof bundle !== 'object' || !bundle.entities || typeof bundle.entities !== 'object') {
      throw new ValidationError('Invalid bundle: missing entities', {});
    }
    if (bundle.version && bundle.version.split('.')[0] !== BUNDLE_VERSION.split('.')[0]) {
      throw new ValidationError(`Unsupported bundle major version ${bundle.version} (expected ${BUNDLE_VERSION})`, {});
    }

    const run = async (db: MetadataPrisma, write: boolean): Promise<ImportDiff> => {
      const diff: ImportDiff = {};
      const record = (group: string, key: string, action: Action) => {
        (diff[group] ??= emptyDiff())[action].push(key);
      };

      // 1) Global picklist sets ------------------------------------------------
      // Always build the name→id map (existing) — custom fields rebind onto it
      // even when the caller didn't include sets in this bundle.
      const existingSets = await db.globalPicklistSet.findMany({ where: { tenantId } });
      const setNameToId = new Map(existingSets.map((s) => [s.name, s.id]));

      for (const s of bundle.entities.globalPicklistSets ?? []) {
        if (typeof s?.name !== 'string' || !s.name) throw new ValidationError('globalPicklistSet.name is required', {});
        const existing = existingSets.find((e) => e.name === s.name);
        const incoming = { options: s.options ?? [], isActive: s.isActive ?? true };
        if (!existing) {
          if (write) {
            const created = await db.globalPicklistSet.create({
              data: { tenantId, name: s.name, options: asJson(incoming.options), isActive: incoming.isActive },
            });
            setNameToId.set(created.name, created.id);
          }
          record('globalPicklistSets', s.name, 'create');
        } else if (equalContent({ options: existing.options, isActive: existing.isActive }, incoming) || conflict === 'SKIP') {
          record('globalPicklistSets', s.name, 'skip');
        } else {
          if (write) {
            await db.globalPicklistSet.update({
              where: { id: existing.id },
              data: { options: asJson(incoming.options), isActive: incoming.isActive },
            });
          }
          record('globalPicklistSets', s.name, 'update');
        }
      }

      // 2) Custom fields -------------------------------------------------------
      if (bundle.entities.customFields) {
        const existingFields = await db.customFieldDefinition.findMany({ where: { tenantId } });
        const byKey = new Map(existingFields.map((f) => [`${f.entityType}::${f.apiKey}`, f]));
        // id→name for existing set references (to compare unchanged rows).
        const setIdToName = new Map(existingSets.map((s) => [s.id, s.name]));
        for (const f of bundle.entities.customFields) {
          if (!f?.entityType || !f?.apiKey) throw new ValidationError('customField requires entityType + apiKey', {});
          const key = `${f.entityType}::${f.apiKey}`;
          const globalSetId = f.globalSetName ? setNameToId.get(f.globalSetName) ?? null : null;
          const incoming = {
            name: f.name,
            fieldType: f.fieldType,
            options: f.options ?? [],
            config: f.config ?? null,
            globalSetName: f.globalSetName ?? null,
            required: f.required ?? false,
            showOnCard: f.showOnCard ?? false,
            position: f.position ?? 0,
            isActive: f.isActive ?? true,
          };
          const existing = byKey.get(key);
          const existingContent = existing && {
            name: existing.name,
            fieldType: existing.fieldType,
            options: existing.options,
            config: existing.config ?? null,
            globalSetName: existing.globalSetId ? setIdToName.get(existing.globalSetId) ?? null : null,
            required: existing.required,
            showOnCard: existing.showOnCard,
            position: existing.position,
            isActive: existing.isActive,
          };
          if (!existing) {
            if (write) {
              await db.customFieldDefinition.create({
                data: {
                  tenantId,
                  entityType: f.entityType,
                  name: f.name,
                  apiKey: f.apiKey,
                  fieldType: f.fieldType,
                  options: asJson(incoming.options),
                  config: asNullableJson(incoming.config),
                  globalSetId,
                  required: incoming.required,
                  showOnCard: incoming.showOnCard,
                  position: incoming.position,
                  isActive: incoming.isActive,
                },
              });
            }
            record('customFields', key, 'create');
          } else if (equalContent(existingContent, incoming) || conflict === 'SKIP') {
            record('customFields', key, 'skip');
          } else {
            if (write) {
              await db.customFieldDefinition.update({
                where: { id: existing.id },
                data: {
                  name: f.name,
                  fieldType: f.fieldType,
                  options: asJson(incoming.options),
                  config: asNullableJson(incoming.config),
                  globalSetId,
                  required: incoming.required,
                  showOnCard: incoming.showOnCard,
                  position: incoming.position,
                  isActive: incoming.isActive,
                },
              });
            }
            record('customFields', key, 'update');
          }
        }
      }

      // 3) Custom modules (+ fields + layouts) ---------------------------------
      if (bundle.entities.customModules) {
        const existingModules = await db.customModule.findMany({ where: { tenantId } });
        const moduleApiToId = new Map(existingModules.map((m) => [m.apiName, m.id]));
        for (const m of bundle.entities.customModules) {
          if (!m?.apiName) throw new ValidationError('customModule.apiName is required', {});
          const incoming = {
            label: m.label,
            pluralLabel: m.pluralLabel,
            description: m.description ?? null,
            icon: m.icon ?? null,
            isActive: m.isActive ?? true,
          };
          let existing = existingModules.find((e) => e.apiName === m.apiName);
          let moduleId = existing?.id ?? null;
          if (!existing) {
            if (write) {
              const created = await db.customModule.create({
                data: { tenantId, apiName: m.apiName, ...incoming },
              });
              moduleId = created.id;
              moduleApiToId.set(created.apiName, created.id);
            }
            record('customModules', m.apiName, 'create');
          } else {
            const existingContent = {
              label: existing.label,
              pluralLabel: existing.pluralLabel,
              description: existing.description ?? null,
              icon: existing.icon ?? null,
              isActive: existing.isActive,
            };
            if (equalContent(existingContent, incoming) || conflict === 'SKIP') {
              record('customModules', m.apiName, 'skip');
            } else {
              if (write) await db.customModule.update({ where: { id: existing.id }, data: incoming });
              record('customModules', m.apiName, 'update');
            }
          }

          // Children need a resolved parent id. In DRY_RUN a brand-new module has
          // no id yet, so we diff its children as pure creates against an empty set.
          const childFields = moduleId
            ? await db.customModuleField.findMany({ where: { tenantId, moduleId } })
            : [];
          for (const cf of m.fields ?? []) {
            if (!cf?.apiName) throw new ValidationError('customModuleField.apiName is required', {});
            const ckey = `${m.apiName}.${cf.apiName}`;
            const incF = {
              label: cf.label,
              type: cf.type,
              required: cf.required ?? false,
              unique: cf.unique ?? false,
              options: cf.options ?? null,
              formula: cf.formula ?? null,
              lookupModule: cf.lookupModule ?? null,
              defaultValue: cf.defaultValue ?? null,
              sortOrder: cf.sortOrder ?? 0,
            };
            const ex = childFields.find((x) => x.apiName === cf.apiName);
            if (!ex) {
              if (write && moduleId) {
                await db.customModuleField.create({
                  data: {
                    tenantId,
                    moduleId,
                    apiName: cf.apiName,
                    label: incF.label,
                    type: incF.type,
                    required: incF.required,
                    unique: incF.unique,
                    options: asNullableJson(incF.options),
                    formula: incF.formula,
                    lookupModule: incF.lookupModule,
                    defaultValue: asNullableJson(incF.defaultValue),
                    sortOrder: incF.sortOrder,
                  },
                });
              }
              record('customModuleFields', ckey, 'create');
            } else {
              const exC = {
                label: ex.label,
                type: ex.type,
                required: ex.required,
                unique: ex.unique,
                options: ex.options ?? null,
                formula: ex.formula ?? null,
                lookupModule: ex.lookupModule ?? null,
                defaultValue: ex.defaultValue ?? null,
                sortOrder: ex.sortOrder,
              };
              if (equalContent(exC, incF) || conflict === 'SKIP') {
                record('customModuleFields', ckey, 'skip');
              } else {
                if (write) {
                  await db.customModuleField.update({
                    where: { id: ex.id },
                    data: {
                      label: incF.label,
                      type: incF.type,
                      required: incF.required,
                      unique: incF.unique,
                      options: asNullableJson(incF.options),
                      formula: incF.formula,
                      lookupModule: incF.lookupModule,
                      defaultValue: asNullableJson(incF.defaultValue),
                      sortOrder: incF.sortOrder,
                    },
                  });
                }
                record('customModuleFields', ckey, 'update');
              }
            }
          }

          const childLayouts = moduleId
            ? await db.customModuleLayout.findMany({ where: { tenantId, moduleId } })
            : [];
          for (const cl of m.layouts ?? []) {
            if (!cl?.name) throw new ValidationError('customModuleLayout.name is required', {});
            const lkey = `${m.apiName}.${cl.name}`;
            const incL = { sections: cl.sections ?? [], isDefault: cl.isDefault ?? false };
            const ex = childLayouts.find((x) => x.name === cl.name);
            if (!ex) {
              if (write && moduleId) {
                await db.customModuleLayout.create({
                  data: { tenantId, moduleId, name: cl.name, sections: asJson(incL.sections), isDefault: incL.isDefault },
                });
              }
              record('customModuleLayouts', lkey, 'create');
            } else if (equalContent({ sections: ex.sections, isDefault: ex.isDefault }, incL) || conflict === 'SKIP') {
              record('customModuleLayouts', lkey, 'skip');
            } else {
              if (write) {
                await db.customModuleLayout.update({
                  where: { id: ex.id },
                  data: { sections: asJson(incL.sections), isDefault: incL.isDefault },
                });
              }
              record('customModuleLayouts', lkey, 'update');
            }
          }
        }
      }

      // 4) Page layouts (+ rules) ----------------------------------------------
      if (bundle.entities.pageLayouts) {
        const existingLayouts = await db.pageLayout.findMany({ where: { tenantId } });
        for (const l of bundle.entities.pageLayouts) {
          if (!l?.module || !l?.name) throw new ValidationError('pageLayout requires module + name', {});
          const key = `${l.module}::${l.name}`;
          const incoming = {
            isDefault: l.isDefault ?? false,
            assignedProfiles: l.assignedProfiles ?? [],
            sections: l.sections ?? [],
            isActive: l.isActive ?? true,
          };
          let existing = existingLayouts.find((e) => e.module === l.module && e.name === l.name);
          let layoutId = existing?.id ?? null;
          if (!existing) {
            if (write) {
              const created = await db.pageLayout.create({
                data: {
                  tenantId,
                  module: l.module,
                  name: l.name,
                  isDefault: incoming.isDefault,
                  assignedProfiles: incoming.assignedProfiles,
                  sections: asJson(incoming.sections),
                  isActive: incoming.isActive,
                },
              });
              layoutId = created.id;
            }
            record('pageLayouts', key, 'create');
          } else {
            const existingContent = {
              isDefault: existing.isDefault,
              assignedProfiles: existing.assignedProfiles,
              sections: existing.sections,
              isActive: existing.isActive,
            };
            if (equalContent(existingContent, incoming) || conflict === 'SKIP') {
              record('pageLayouts', key, 'skip');
            } else {
              if (write) {
                await db.pageLayout.update({
                  where: { id: existing.id },
                  data: {
                    isDefault: incoming.isDefault,
                    assignedProfiles: incoming.assignedProfiles,
                    sections: asJson(incoming.sections),
                    isActive: incoming.isActive,
                  },
                });
              }
              record('pageLayouts', key, 'update');
            }
          }

          const childRules = layoutId ? await db.layoutRule.findMany({ where: { tenantId, layoutId } }) : [];
          for (const rl of l.rules ?? []) {
            if (!rl?.name) throw new ValidationError('layoutRule.name is required', {});
            const rkey = `${key}::${rl.name}`;
            const incR = {
              triggerField: rl.triggerField,
              operator: rl.operator,
              triggerValue: rl.triggerValue ?? null,
              actions: rl.actions ?? [],
              position: rl.position ?? 0,
              isActive: rl.isActive ?? true,
            };
            const ex = childRules.find((x) => x.name === rl.name);
            if (!ex) {
              if (write && layoutId) {
                await db.layoutRule.create({
                  data: {
                    tenantId,
                    layoutId,
                    name: rl.name,
                    triggerField: incR.triggerField,
                    operator: incR.operator,
                    triggerValue: incR.triggerValue === null ? Prisma.JsonNull : asJson(incR.triggerValue),
                    actions: asJson(incR.actions),
                    position: incR.position,
                    isActive: incR.isActive,
                  },
                });
              }
              record('layoutRules', rkey, 'create');
            } else {
              const exC = {
                triggerField: ex.triggerField,
                operator: ex.operator,
                triggerValue: ex.triggerValue ?? null,
                actions: ex.actions ?? [],
                position: ex.position,
                isActive: ex.isActive,
              };
              if (equalContent(exC, incR) || conflict === 'SKIP') {
                record('layoutRules', rkey, 'skip');
              } else {
                if (write) {
                  await db.layoutRule.update({
                    where: { id: ex.id },
                    data: {
                      triggerField: incR.triggerField,
                      operator: incR.operator,
                      triggerValue: incR.triggerValue === null ? Prisma.JsonNull : asJson(incR.triggerValue),
                      actions: asJson(incR.actions),
                      position: incR.position,
                      isActive: incR.isActive,
                    },
                  });
                }
                record('layoutRules', rkey, 'update');
              }
            }
          }
        }
      }

      // 5) Related lists -------------------------------------------------------
      if (bundle.entities.relatedLists) {
        const existingRL = await db.relatedListConfig.findMany({ where: { tenantId } });
        for (const r of bundle.entities.relatedLists) {
          if (!r?.module || !r?.name) throw new ValidationError('relatedList requires module + name', {});
          const key = `${r.module}::${r.name}`;
          const incoming = {
            relatedModule: r.relatedModule,
            displayFields: r.displayFields ?? [],
            sortBy: r.sortBy ?? null,
            visibleToProfiles: r.visibleToProfiles ?? [],
            sortOrder: r.sortOrder ?? 0,
            isActive: r.isActive ?? true,
          };
          const existing = existingRL.find((e) => e.module === r.module && e.name === r.name);
          if (!existing) {
            if (write) await db.relatedListConfig.create({ data: { tenantId, module: r.module, name: r.name, ...incoming } });
            record('relatedLists', key, 'create');
          } else {
            const existingContent = {
              relatedModule: existing.relatedModule,
              displayFields: existing.displayFields,
              sortBy: existing.sortBy ?? null,
              visibleToProfiles: existing.visibleToProfiles,
              sortOrder: existing.sortOrder,
              isActive: existing.isActive,
            };
            if (equalContent(existingContent, incoming) || conflict === 'SKIP') {
              record('relatedLists', key, 'skip');
            } else {
              if (write) await db.relatedListConfig.update({ where: { id: existing.id }, data: incoming });
              record('relatedLists', key, 'update');
            }
          }
        }
      }

      // 6) Validation rules ----------------------------------------------------
      if (bundle.entities.validationRules) {
        const existingVR = await db.validationRule.findMany({ where: { tenantId } });
        for (const v of bundle.entities.validationRules) {
          if (!v?.objectType || !v?.name) throw new ValidationError('validationRule requires objectType + name', {});
          const key = `${v.objectType}::${v.name}`;
          const incoming = {
            condition: v.condition ?? {},
            requirement: v.requirement ?? {},
            errorMessage: v.errorMessage ?? '',
            isActive: v.isActive ?? true,
          };
          const existing = existingVR.find((e) => e.objectType === v.objectType && e.name === v.name);
          if (!existing) {
            if (write) {
              await db.validationRule.create({
                data: {
                  tenantId,
                  objectType: v.objectType,
                  name: v.name,
                  condition: asJson(incoming.condition),
                  requirement: asJson(incoming.requirement),
                  errorMessage: incoming.errorMessage,
                  isActive: incoming.isActive,
                },
              });
            }
            record('validationRules', key, 'create');
          } else {
            const existingContent = {
              condition: existing.condition,
              requirement: existing.requirement,
              errorMessage: existing.errorMessage,
              isActive: existing.isActive,
            };
            if (equalContent(existingContent, incoming) || conflict === 'SKIP') {
              record('validationRules', key, 'skip');
            } else {
              if (write) {
                await db.validationRule.update({
                  where: { id: existing.id },
                  data: {
                    condition: asJson(incoming.condition),
                    requirement: asJson(incoming.requirement),
                    errorMessage: incoming.errorMessage,
                    isActive: incoming.isActive,
                  },
                });
              }
              record('validationRules', key, 'update');
            }
          }
        }
      }

      return diff;
    };

    // APPLY runs the whole diff+write path in one interactive transaction.
    const diff =
      mode === 'APPLY'
        ? await prisma.$transaction((tx) => run(tx as unknown as MetadataPrisma, true))
        : await run(prisma, false);

    const totals = Object.values(diff).reduce(
      (acc, g) => {
        acc.created += g.create.length;
        acc.updated += g.update.length;
        acc.skipped += g.skip.length;
        return acc;
      },
      { created: 0, updated: 0, skipped: 0 }
    );

    const summary: ImportSummary = {
      mode,
      conflict,
      bundleVersion: bundle.version ?? BUNDLE_VERSION,
      sourceTenantId: bundle.tenantId ?? null,
      totals,
      diff,
    };

    // Audit every import attempt (DRY_RUN included) into the CALLING tenant.
    await prisma.configImportLog.create({
      data: {
        tenantId,
        bundleVersion: summary.bundleVersion,
        mode,
        conflict,
        summary: asJson(summary),
      },
    });

    return summary;
  }

  async function listImportLogs(tenantId: string, limit = 50) {
    return prisma.configImportLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  return { exportConfig, importConfig, listImportLogs };
}

export type ConfigService = ReturnType<typeof createConfigService>;
