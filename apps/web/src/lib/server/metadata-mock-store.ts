/**
 * In-memory dev-preview store for metadata-service (low-code platform).
 *
 * Backs the module admin + dynamic records UIs (/api/custom-modules/**,
 * /api/formula/evaluate) without a live metadata-service. Persists across
 * requests within a single dev server process. Seeded with one sample module
 * (fields + layout + a couple of records) so the UI works end-to-end.
 */

export type FieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'PICKLIST'
  | 'MULTISELECT'
  | 'EMAIL'
  | 'PHONE'
  | 'CURRENCY'
  | 'FORMULA'
  | 'LOOKUP';

export interface CustomField {
  id: string;
  moduleId: string;
  label: string;
  apiName: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  order: number;
  options?: string[];
  formula?: string;
  lookupModule?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutSection {
  title: string;
  columns: number;
  fields: string[]; // fieldApiName[]
}

export interface CustomLayout {
  id: string;
  moduleId: string;
  name: string;
  sections: LayoutSection[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomModule {
  id: string;
  label: string;
  pluralLabel: string;
  apiName: string;
  description?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRecord {
  id: string;
  moduleId: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MetadataState {
  modules: CustomModule[];
  fields: CustomField[];
  layouts: CustomLayout[];
  records: CustomRecord[];
}

const g = globalThis as unknown as { __nexusMetadataStore?: MetadataState };

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seed(): MetadataState {
  const moduleId = 'mod_projects';
  const ts = nowIso();
  const mod: CustomModule = {
    id: moduleId,
    label: 'Project',
    pluralLabel: 'Projects',
    apiName: 'project',
    description: 'Delivery projects tracked alongside deals',
    icon: '📁',
    createdAt: ts,
    updatedAt: ts,
  };
  const fields: CustomField[] = [
    { id: id('fld'), moduleId, label: 'Name', apiName: 'name', type: 'TEXT', required: true, unique: false, order: 0, createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Status', apiName: 'status', type: 'PICKLIST', required: true, unique: false, order: 1, options: ['Planned', 'Active', 'On Hold', 'Complete'], createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Budget', apiName: 'budget', type: 'CURRENCY', required: false, unique: false, order: 2, createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Spent', apiName: 'spent', type: 'CURRENCY', required: false, unique: false, order: 3, createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Remaining', apiName: 'remaining', type: 'FORMULA', required: false, unique: false, order: 4, formula: 'budget - spent', createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Owner Email', apiName: 'ownerEmail', type: 'EMAIL', required: false, unique: false, order: 5, createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Start Date', apiName: 'startDate', type: 'DATE', required: false, unique: false, order: 6, createdAt: ts, updatedAt: ts },
    { id: id('fld'), moduleId, label: 'Active', apiName: 'active', type: 'BOOLEAN', required: false, unique: false, order: 7, createdAt: ts, updatedAt: ts },
  ];
  const layout: CustomLayout = {
    id: id('lyt'),
    moduleId,
    name: 'Default Layout',
    isDefault: true,
    sections: [
      { title: 'Overview', columns: 2, fields: ['name', 'status', 'ownerEmail', 'startDate'] },
      { title: 'Financials', columns: 2, fields: ['budget', 'spent', 'remaining', 'active'] },
    ],
    createdAt: ts,
    updatedAt: ts,
  };
  const records: CustomRecord[] = [
    { id: id('rec'), moduleId, values: { name: 'Atlas Rollout', status: 'Active', budget: 120000, spent: 45000, ownerEmail: 'lead@acme.test', startDate: '2026-06-01', active: true }, createdAt: ts, updatedAt: ts },
    { id: id('rec'), moduleId, values: { name: 'Beacon Migration', status: 'Planned', budget: 80000, spent: 0, ownerEmail: 'pm@acme.test', startDate: '2026-08-15', active: false }, createdAt: ts, updatedAt: ts },
  ];
  return { modules: [mod], fields, layouts: [layout], records };
}

function store(): MetadataState {
  if (!g.__nexusMetadataStore) {
    g.__nexusMetadataStore = seed();
  }
  return g.__nexusMetadataStore;
}

// ---- Modules ----
export function listModules(): CustomModule[] {
  return store().modules;
}

export function getModule(moduleId: string): CustomModule | undefined {
  return store().modules.find((m) => m.id === moduleId || m.apiName === moduleId);
}

export function createModule(input: Record<string, unknown>): CustomModule {
  const ts = nowIso();
  const label = String(input.label ?? 'Untitled');
  const mod: CustomModule = {
    id: id('mod'),
    label,
    pluralLabel: String(input.pluralLabel ?? `${label}s`),
    apiName: String(input.apiName ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
    description: input.description ? String(input.description) : undefined,
    icon: input.icon ? String(input.icon) : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  store().modules.push(mod);
  return mod;
}

export function updateModule(moduleId: string, patch: Record<string, unknown>): CustomModule | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  Object.assign(mod, {
    label: patch.label !== undefined ? String(patch.label) : mod.label,
    pluralLabel: patch.pluralLabel !== undefined ? String(patch.pluralLabel) : mod.pluralLabel,
    description: patch.description !== undefined ? String(patch.description) : mod.description,
    icon: patch.icon !== undefined ? String(patch.icon) : mod.icon,
    updatedAt: nowIso(),
  });
  return mod;
}

export function deleteModule(moduleId: string): boolean {
  const s = store();
  const mod = getModule(moduleId);
  if (!mod) return false;
  s.modules = s.modules.filter((m) => m.id !== mod.id);
  s.fields = s.fields.filter((f) => f.moduleId !== mod.id);
  s.layouts = s.layouts.filter((l) => l.moduleId !== mod.id);
  s.records = s.records.filter((r) => r.moduleId !== mod.id);
  return true;
}

// ---- Fields ----
export function listFields(moduleId: string): CustomField[] {
  const mod = getModule(moduleId);
  if (!mod) return [];
  return store().fields.filter((f) => f.moduleId === mod.id).sort((a, b) => a.order - b.order);
}

export function createField(moduleId: string, input: Record<string, unknown>): CustomField | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  const ts = nowIso();
  const existing = listFields(mod.id);
  const label = String(input.label ?? 'Field');
  const field: CustomField = {
    id: id('fld'),
    moduleId: mod.id,
    label,
    apiName: String(input.apiName ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
    type: (input.type as FieldType) ?? 'TEXT',
    required: Boolean(input.required),
    unique: Boolean(input.unique),
    order: existing.length,
    options: Array.isArray(input.options) ? (input.options as string[]) : undefined,
    formula: input.formula ? String(input.formula) : undefined,
    lookupModule: input.lookupModule ? String(input.lookupModule) : undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  store().fields.push(field);
  return field;
}

export function updateField(moduleId: string, fieldId: string, patch: Record<string, unknown>): CustomField | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  const field = store().fields.find((f) => f.id === fieldId && f.moduleId === mod.id);
  if (!field) return undefined;
  Object.assign(field, {
    label: patch.label !== undefined ? String(patch.label) : field.label,
    type: patch.type !== undefined ? (patch.type as FieldType) : field.type,
    required: patch.required !== undefined ? Boolean(patch.required) : field.required,
    unique: patch.unique !== undefined ? Boolean(patch.unique) : field.unique,
    options: patch.options !== undefined ? (patch.options as string[]) : field.options,
    formula: patch.formula !== undefined ? String(patch.formula) : field.formula,
    lookupModule: patch.lookupModule !== undefined ? String(patch.lookupModule) : field.lookupModule,
    updatedAt: nowIso(),
  });
  return field;
}

export function deleteField(moduleId: string, fieldId: string): boolean {
  const mod = getModule(moduleId);
  if (!mod) return false;
  const s = store();
  const before = s.fields.length;
  s.fields = s.fields.filter((f) => !(f.id === fieldId && f.moduleId === mod.id));
  return s.fields.length < before;
}

export function reorderFields(moduleId: string, order: string[]): CustomField[] | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  const fields = store().fields.filter((f) => f.moduleId === mod.id);
  order.forEach((fieldId, index) => {
    const field = fields.find((f) => f.id === fieldId);
    if (field) {
      field.order = index;
      field.updatedAt = nowIso();
    }
  });
  return listFields(mod.id);
}

// ---- Layouts ----
export function listLayouts(moduleId: string): CustomLayout[] {
  const mod = getModule(moduleId);
  if (!mod) return [];
  return store().layouts.filter((l) => l.moduleId === mod.id);
}

export function getLayout(moduleId: string, layoutId: string): CustomLayout | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  return store().layouts.find((l) => l.id === layoutId && l.moduleId === mod.id);
}

export function createLayout(moduleId: string, input: Record<string, unknown>): CustomLayout | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  const ts = nowIso();
  const layout: CustomLayout = {
    id: id('lyt'),
    moduleId: mod.id,
    name: String(input.name ?? 'Layout'),
    sections: (input.sections as LayoutSection[]) ?? [],
    isDefault: Boolean(input.isDefault) || listLayouts(mod.id).length === 0,
    createdAt: ts,
    updatedAt: ts,
  };
  store().layouts.push(layout);
  return layout;
}

export function updateLayout(moduleId: string, layoutId: string, patch: Record<string, unknown>): CustomLayout | undefined {
  const layout = getLayout(moduleId, layoutId);
  if (!layout) return undefined;
  Object.assign(layout, {
    name: patch.name !== undefined ? String(patch.name) : layout.name,
    sections: patch.sections !== undefined ? (patch.sections as LayoutSection[]) : layout.sections,
    isDefault: patch.isDefault !== undefined ? Boolean(patch.isDefault) : layout.isDefault,
    updatedAt: nowIso(),
  });
  return layout;
}

export function deleteLayout(moduleId: string, layoutId: string): boolean {
  const mod = getModule(moduleId);
  if (!mod) return false;
  const s = store();
  const before = s.layouts.length;
  s.layouts = s.layouts.filter((l) => !(l.id === layoutId && l.moduleId === mod.id));
  return s.layouts.length < before;
}

// ---- Records ----
export interface RecordListResult {
  data: CustomRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export function listRecords(
  moduleId: string,
  opts: { page?: number; pageSize?: number; filter?: string } = {}
): RecordListResult {
  const mod = getModule(moduleId);
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  if (!mod) return { data: [], page, pageSize, total: 0 };
  let rows = store().records.filter((r) => r.moduleId === mod.id);
  if (opts.filter) {
    const needle = opts.filter.toLowerCase();
    rows = rows.filter((r) =>
      Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(needle))
    );
  }
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), page, pageSize, total };
}

export function getRecord(moduleId: string, recordId: string): CustomRecord | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  return store().records.find((r) => r.id === recordId && r.moduleId === mod.id);
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Validates a record's values against the mod fields. Returns issues (empty = valid). */
export function validateRecord(moduleId: string, values: Record<string, unknown>, recordId?: string): ValidationIssue[] {
  const mod = getModule(moduleId);
  if (!mod) return [{ field: '_module', message: 'Module not found' }];
  const fields = listFields(mod.id);
  const issues: ValidationIssue[] = [];
  for (const field of fields) {
    if (field.type === 'FORMULA') continue;
    const value = values[field.apiName];
    const empty = value === undefined || value === null || value === '';
    if (field.required && empty) {
      issues.push({ field: field.apiName, message: `${field.label} is required` });
      continue;
    }
    if (empty) continue;
    if ((field.type === 'NUMBER' || field.type === 'CURRENCY') && Number.isNaN(Number(value))) {
      issues.push({ field: field.apiName, message: `${field.label} must be a number` });
    }
    if (field.type === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value))) {
      issues.push({ field: field.apiName, message: `${field.label} must be a valid email` });
    }
    if (field.type === 'PICKLIST' && field.options && !field.options.includes(String(value))) {
      issues.push({ field: field.apiName, message: `${field.label} must be one of ${field.options.join(', ')}` });
    }
    if (field.unique) {
      const clash = store().records.some(
        (r) => r.moduleId === mod.id && r.id !== recordId && r.values[field.apiName] === value
      );
      if (clash) issues.push({ field: field.apiName, message: `${field.label} must be unique` });
    }
  }
  return issues;
}

export function createRecord(moduleId: string, values: Record<string, unknown>): CustomRecord | ValidationIssue[] | undefined {
  const mod = getModule(moduleId);
  if (!mod) return undefined;
  const issues = validateRecord(mod.id, values);
  if (issues.length) return issues;
  const ts = nowIso();
  const record: CustomRecord = { id: id('rec'), moduleId: mod.id, values, createdAt: ts, updatedAt: ts };
  store().records.push(record);
  return record;
}

export function updateRecord(moduleId: string, recordId: string, values: Record<string, unknown>): CustomRecord | ValidationIssue[] | undefined {
  const record = getRecord(moduleId, recordId);
  if (!record) return undefined;
  const issues = validateRecord(record.moduleId, { ...record.values, ...values }, recordId);
  if (issues.length) return issues;
  record.values = { ...record.values, ...values };
  record.updatedAt = nowIso();
  return record;
}

export function deleteRecord(moduleId: string, recordId: string): boolean {
  const mod = getModule(moduleId);
  if (!mod) return false;
  const s = store();
  const before = s.records.length;
  s.records = s.records.filter((r) => !(r.id === recordId && r.moduleId === mod.id));
  return s.records.length < before;
}

/**
 * Tiny arithmetic formula evaluator for dev-preview. Supports + - * / and
 * parentheses over numeric field references and literals. Returns null on error.
 */
export function evaluateFormula(formula: string, record: Record<string, unknown>): number | string | null {
  try {
    const substituted = formula.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (token) => {
      const value = record[token];
      const num = Number(value);
      return Number.isFinite(num) ? String(num) : '0';
    });
    if (!/^[0-9+\-*/().\s]+$/.test(substituted)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict";return (${substituted});`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
