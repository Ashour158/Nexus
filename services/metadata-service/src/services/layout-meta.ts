/**
 * Pure builder for the Layout-builder metadata surface (backs a future visual
 * layout editor). It fuses three field sources into one per-module catalog:
 *   1. A built-in catalog of standard CRM modules + their common fields.
 *   2. Tenant custom fields (CustomFieldDefinition, keyed by entityType).
 *   3. Tenant custom modules (CustomModule + CustomModuleField).
 *
 * Dependency-free and total — safe to unit test and reuse.
 */

export interface MetaField {
  apiName: string;
  label: string;
  type: string;
  source: 'standard' | 'custom';
}

export interface MetaModule {
  module: string;
  label: string;
  isCustom: boolean;
  fields: MetaField[];
}

export interface LayoutBuilderMeta {
  modules: MetaModule[];
  operators: string[];
  actionTypes: string[];
}

/** Minimal row shapes (subset of the Prisma models) this builder consumes. */
interface CustomFieldRow {
  entityType: string;
  name: string;
  apiKey: string;
  fieldType: string;
}
interface CustomModuleRow {
  id: string;
  apiName: string;
  label: string;
  pluralLabel?: string;
}
interface CustomModuleFieldRow {
  moduleId: string;
  apiName: string;
  label: string;
  type: string;
}

/**
 * Built-in standard modules and their common fields. This gives the builder a
 * sensible baseline to render even before any custom fields exist. Extending
 * this list is additive and backward-compatible.
 */
export const STANDARD_MODULES: MetaModule[] = [
  {
    module: 'lead',
    label: 'Lead',
    isCustom: false,
    fields: [
      { apiName: 'firstName', label: 'First Name', type: 'text', source: 'standard' },
      { apiName: 'lastName', label: 'Last Name', type: 'text', source: 'standard' },
      { apiName: 'company', label: 'Company', type: 'text', source: 'standard' },
      { apiName: 'email', label: 'Email', type: 'email', source: 'standard' },
      { apiName: 'phone', label: 'Phone', type: 'phone', source: 'standard' },
      { apiName: 'status', label: 'Status', type: 'picklist', source: 'standard' },
      { apiName: 'source', label: 'Lead Source', type: 'picklist', source: 'standard' },
      { apiName: 'ownerId', label: 'Owner', type: 'user', source: 'standard' },
    ],
  },
  {
    module: 'account',
    label: 'Account',
    isCustom: false,
    fields: [
      { apiName: 'name', label: 'Account Name', type: 'text', source: 'standard' },
      { apiName: 'industry', label: 'Industry', type: 'picklist', source: 'standard' },
      { apiName: 'website', label: 'Website', type: 'url', source: 'standard' },
      { apiName: 'phone', label: 'Phone', type: 'phone', source: 'standard' },
      { apiName: 'type', label: 'Type', type: 'picklist', source: 'standard' },
      { apiName: 'annualRevenue', label: 'Annual Revenue', type: 'currency', source: 'standard' },
      { apiName: 'ownerId', label: 'Owner', type: 'user', source: 'standard' },
    ],
  },
  {
    module: 'contact',
    label: 'Contact',
    isCustom: false,
    fields: [
      { apiName: 'firstName', label: 'First Name', type: 'text', source: 'standard' },
      { apiName: 'lastName', label: 'Last Name', type: 'text', source: 'standard' },
      { apiName: 'email', label: 'Email', type: 'email', source: 'standard' },
      { apiName: 'phone', label: 'Phone', type: 'phone', source: 'standard' },
      { apiName: 'title', label: 'Title', type: 'text', source: 'standard' },
      { apiName: 'accountId', label: 'Account', type: 'lookup', source: 'standard' },
      { apiName: 'ownerId', label: 'Owner', type: 'user', source: 'standard' },
    ],
  },
  {
    module: 'deal',
    label: 'Deal',
    isCustom: false,
    fields: [
      { apiName: 'name', label: 'Deal Name', type: 'text', source: 'standard' },
      { apiName: 'amount', label: 'Amount', type: 'currency', source: 'standard' },
      { apiName: 'stage', label: 'Stage', type: 'picklist', source: 'standard' },
      { apiName: 'closeDate', label: 'Close Date', type: 'date', source: 'standard' },
      { apiName: 'probability', label: 'Probability', type: 'percent', source: 'standard' },
      { apiName: 'accountId', label: 'Account', type: 'lookup', source: 'standard' },
      { apiName: 'ownerId', label: 'Owner', type: 'user', source: 'standard' },
    ],
  },
];

export interface BuildLayoutMetaArgs {
  customFields: CustomFieldRow[];
  customModules: CustomModuleRow[];
  customModuleFields: CustomModuleFieldRow[];
  operators: string[];
  actionTypes: string[];
}

export function buildLayoutMeta(args: BuildLayoutMetaArgs): LayoutBuilderMeta {
  // Deep-clone the standard catalog so appended custom fields don't mutate it.
  const byModule = new Map<string, MetaModule>();
  for (const m of STANDARD_MODULES) {
    byModule.set(m.module, { ...m, fields: m.fields.map((f) => ({ ...f })) });
  }

  // Merge tenant custom fields into their standard module (or create a bucket
  // for a module we don't ship a catalog for, e.g. a renamed standard object).
  for (const cf of args.customFields ?? []) {
    const key = cf.entityType;
    let mod = byModule.get(key);
    if (!mod) {
      mod = { module: key, label: titleize(key), isCustom: false, fields: [] };
      byModule.set(key, mod);
    }
    if (!mod.fields.some((f) => f.apiName === cf.apiKey)) {
      mod.fields.push({ apiName: cf.apiKey, label: cf.name, type: cf.fieldType, source: 'custom' });
    }
  }

  // Custom modules: keyed by their apiName, fields pulled from CustomModuleField.
  const fieldsByModuleId = new Map<string, CustomModuleFieldRow[]>();
  for (const f of args.customModuleFields ?? []) {
    const list = fieldsByModuleId.get(f.moduleId) ?? [];
    list.push(f);
    fieldsByModuleId.set(f.moduleId, list);
  }
  for (const cm of args.customModules ?? []) {
    const fields = (fieldsByModuleId.get(cm.id) ?? []).map<MetaField>((f) => ({
      apiName: f.apiName,
      label: f.label,
      type: String(f.type).toLowerCase(),
      source: 'custom',
    }));
    byModule.set(cm.apiName, { module: cm.apiName, label: cm.label, isCustom: true, fields });
  }

  return {
    modules: [...byModule.values()],
    operators: args.operators,
    actionTypes: args.actionTypes,
  };
}

function titleize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
