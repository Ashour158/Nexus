import type { CrmPrisma } from '../prisma.js';

export type TrackedObject = 'deal' | 'contact' | 'lead' | 'account';

/** Canonical Prisma/API field keys per object (aligned to `schema.prisma`). */
export const TRACKED_FIELDS: Record<TrackedObject, string[]> = {
  deal: [
    'name',
    'amount',
    'stageId',
    'pipelineId',
    'probability',
    'expectedCloseDate',
    'ownerId',
    'accountId',
    'closeReason',
    'lostReason',
    'status',
  ],
  contact: [
    'firstName',
    'lastName',
    'email',
    'phone',
    'jobTitle',
    'ownerId',
    'accountId',
    'department',
    'country',
    'linkedinUrl',
    'customFields',
    'tags',
  ],
  lead: ['status', 'ownerId', 'score', 'firstName', 'lastName'],
  account: [
    'code',
    'name',
    'legalName',
    'tradeName',
    'industry',
    'subIndustry',
    'ownerId',
    'annualRevenue',
    'website',
    'email',
    'phone',
    'fax',
    'type',
    'tier',
    'status',
    'lifecycleStage',
    'taxId',
    'vatNumber',
    'commercialRegistrationNumber',
    'paymentTerms',
    'creditLimit',
    'currency',
    'priceBookId',
    'territoryId',
    'riskLevel',
    'billingAddressLine1',
    'billingCity',
    'billingCountry',
    'shippingAddressLine1',
    'shippingCity',
    'shippingCountry',
    'country',
    'city',
    'address',
    'customFields',
    'tags',
  ],
};

export async function recordFieldChanges(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: TrackedObject,
  objectId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  changedBy: string,
  changedByName?: string
): Promise<void> {
  const tracked = TRACKED_FIELDS[objectType] ?? [];
  const changes: Array<{
    tenantId: string;
    objectType: string;
    objectId: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedByName?: string;
  }> = [];

  for (const field of tracked) {
    const oldVal = oldValues[field];
    const newVal = newValues[field];
    if (oldVal === newVal) continue;
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    changes.push({
      tenantId,
      objectType,
      objectId,
      fieldName: field,
      oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : null,
      newValue: newVal !== undefined && newVal !== null ? String(newVal) : null,
      changedBy,
      changedByName,
    });
  }

  if (changes.length > 0) {
    await prisma.fieldChangeLog.createMany({ data: changes });
  }
}

/**
 * Records the initial snapshot of a freshly-created record: one entry per tracked
 * field that has a non-empty value, with `oldValue = null`. Fail-open — a history
 * failure must never break the create path.
 */
export async function recordCreateSnapshot(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: TrackedObject,
  objectId: string,
  record: Record<string, unknown>,
  changedBy: string,
  changedByName?: string
): Promise<void> {
  const tracked = TRACKED_FIELDS[objectType] ?? [];
  const changes = tracked
    .map((field) => ({ field, value: record[field] }))
    .filter((c) => c.value !== undefined && c.value !== null)
    .map((c) => ({
      tenantId,
      objectType,
      objectId,
      fieldName: c.field,
      oldValue: null,
      newValue: stringify(c.value),
      changedBy,
      changedByName,
    }));
  if (changes.length === 0) return;
  try {
    await prisma.fieldChangeLog.createMany({ data: changes });
  } catch {
    /* fail-open */
  }
}

/**
 * Records a single field transition (used for archive/restore status flips and
 * merge markers). Fail-open.
 */
export async function recordSingleChange(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: TrackedObject,
  objectId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  changedBy: string,
  changedByName?: string
): Promise<void> {
  try {
    await prisma.fieldChangeLog.create({
      data: {
        tenantId,
        objectType,
        objectId,
        fieldName,
        oldValue: oldValue !== undefined && oldValue !== null ? stringify(oldValue) : null,
        newValue: newValue !== undefined && newValue !== null ? stringify(newValue) : null,
        changedBy,
        changedByName,
      },
    });
  } catch {
    /* fail-open */
  }
}

function stringify(v: unknown): string {
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export async function getFieldHistory(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: TrackedObject,
  objectId: string,
  fieldName?: string
) {
  return prisma.fieldChangeLog.findMany({
    where: {
      tenantId,
      objectType,
      objectId,
      ...(fieldName ? { fieldName } : {}),
    },
    orderBy: { changedAt: 'desc' },
    take: 200,
  });
}

export interface FieldHistoryPage {
  items: Array<{
    id: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
    changedBy: string;
    changedByName: string | null;
    changedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated, newest-first field-change timeline for a single record.
 *
 * `blockedFields` (from {@link getReadBlockedFields}) is applied at the SQL layer
 * — rows for fields the caller cannot read are excluded from BOTH the page and
 * the total, so FLS-masked fields never leak through the count either.
 */
export async function getFieldHistoryPaged(
  prisma: CrmPrisma,
  tenantId: string,
  objectType: TrackedObject,
  objectId: string,
  opts: { page?: number; pageSize?: number; fieldName?: string; blockedFields?: Set<string> } = {}
): Promise<FieldHistoryPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(opts.pageSize ?? 50)));
  const blocked = opts.blockedFields && opts.blockedFields.size > 0 ? [...opts.blockedFields] : undefined;

  const where = {
    tenantId,
    objectType,
    objectId,
    ...(opts.fieldName ? { fieldName: opts.fieldName } : {}),
    ...(blocked ? { fieldName: { notIn: blocked } } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.fieldChangeLog.count({ where }),
    prisma.fieldChangeLog.findMany({
      where,
      orderBy: { changedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fieldName: true,
        oldValue: true,
        newValue: true,
        changedBy: true,
        changedByName: true,
        changedAt: true,
      },
    }),
  ]);

  return { items, total, page, pageSize };
}
