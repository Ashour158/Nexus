import type { PaginatedResult, TimelineEvent } from '@nexus/shared-types';
import { BusinessRuleError, ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  ContactListQuery,
  CreateContactInput,
  UpdateContactInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { computeBlindIndex } from '@nexus/security';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { Contact, Deal } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';
import {
  recordFieldChanges,
  recordCreateSnapshot,
  recordSingleChange,
} from '../lib/field-history.js';
import { validateCustomFields } from '../lib/custom-field-validation.js';
import { updateContactDataQuality } from '../lib/data-quality.js';
import { enrichContact } from '../lib/enrichment.engine.js';
import {
  enforceValidationRules,
  applyFieldPermissions,
  maskFieldPermissions,
  mergeForValidation,
} from '../lib/write-guards.js';
import type { ReadAccessContext } from './deals.service.js';

type ContactListFilters = Omit<
  ContactListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

function buildWhere(
  tenantId: string,
  filters: ContactListFilters
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.ContactOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'lastName', 'firstName']);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.ContactOrderByWithRelationInput
  );
}

export function createContactsService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Contact> {
    const row = await prisma.contact.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Contact', id);
    return row;
  }

  return {
    async listContacts(
      tenantId: string,
      filters: ContactListFilters,
      pagination: ListPagination,
      access?: ReadAccessContext
    ): Promise<PaginatedResult<Contact>> {
      // Ownership scope is intersected into the tenant+filter where (additive).
      const where = {
        ...buildWhere(tenantId, filters),
        ...(access?.ownershipWhere ?? {}),
      } as Prisma.ContactWhereInput;
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.ContactOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const [total, rows] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy,
        }),
      ]);
      const masked = (await maskFieldPermissions(
        prisma,
        tenantId,
        'contact',
        rows as unknown as Record<string, unknown>[],
        access?.roles
      )) as unknown as Contact[];
      return toPaginatedResult(masked, total, pagination.page, pagination.limit);
    },

    async getContactById(tenantId: string, id: string, access?: ReadAccessContext): Promise<Contact & { emails: unknown[]; addresses: unknown[] }> {
      const contact = await prisma.contact.findFirst({
        where: { id, tenantId },
        include: { emails: true, addresses: true },
      });
      if (!contact) throw new NotFoundError('Contact', id);
      return (await maskFieldPermissions(
        prisma,
        tenantId,
        'contact',
        contact as unknown as Record<string, unknown>,
        access?.roles
      )) as unknown as Contact & { emails: unknown[]; addresses: unknown[] };
    },

    async createContact(tenantId: string, data: CreateContactInput & { emails?: Array<{ email: string; label?: string; isPrimary?: boolean }>; addresses?: Array<{ label?: string; street?: string; city?: string; state?: string; postalCode?: string; country?: string }> }): Promise<Contact> {
      if (!data.accountId) throw new NotFoundError('Account', 'required');
      const account = await prisma.account.findFirst({
        where: { id: data.accountId, tenantId },
      });
      if (!account) throw new NotFoundError('Account', data.accountId);
      // Dedup on the deterministic blind index, not the raw email: when field
      // encryption is on, `email` is stored as randomized ciphertext, so a
      // plaintext match would never hit. `emailHash` is deterministic in BOTH
      // modes (encryption on/off), so it is the reliable uniqueness key.
      const emailHash = data.email ? computeBlindIndex(data.email) : null;
      if (data.email) {
        const existing = await prisma.contact.findFirst({
          where: { emailHash, tenantId },
        });
        if (existing) throw new ConflictError('Contact', 'email');
      }

      // Enforce active validation rules (fail-open: no rules / eval error => allow).
      await enforceValidationRules(prisma, tenantId, 'contact', data as Record<string, unknown>);
      // Low-code governance: validate customFields against CustomFieldDefinition (422 on violation, fail-open).
      await validateCustomFields(prisma, tenantId, 'contact', data.customFields);

      const emails = data.emails && data.emails.length > 0 ? data.emails : (data.email ? [{ email: data.email, label: 'work', isPrimary: true }] : []);
      const hasPrimary = emails.some((e) => e.isPrimary);
      if (emails.length > 0 && !hasPrimary) emails[0].isPrimary = true;

      const created = await prisma.contact.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          accountId: data.accountId ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? null,
          emailHash,
          phone: data.phone ?? null,
          mobile: data.mobile ?? null,
          jobTitle: data.jobTitle ?? null,
          department: data.department ?? null,
          linkedInUrl: data.linkedInUrl ?? null,
          twitterHandle: data.twitterHandle ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          address: data.address ?? null,
          timezone: data.timezone ?? null,
          preferredChannel: data.preferredChannel ?? null,
          doNotEmail: data.doNotEmail ?? false,
          doNotCall: data.doNotCall ?? false,
          gdprConsent: data.gdprConsent ?? false,
          gdprConsentAt: data.gdprConsent ? new Date() : null,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
          emails: { create: emails.map((e) => ({ email: e.email, label: e.label ?? 'work', isPrimary: e.isPrimary ?? false })) },
          addresses: { create: (data.addresses ?? []).map((a) => ({ label: a.label ?? 'work', street: a.street ?? null, city: a.city ?? null, state: a.state ?? null, postalCode: a.postalCode ?? null, country: a.country ?? null })) },
        },
      });

      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.created',
          tenantId,
          payload: {
            id: created.id,
            contactId: created.id,
            firstName: created.firstName,
            lastName: created.lastName,
            email: created.email ?? undefined,
            accountId: created.accountId ?? undefined,
            ownerId: created.ownerId,
          },
        })
        .catch(() => undefined);

      // Full history: initial snapshot on CREATE (oldValue=null per tracked field).
      await recordCreateSnapshot(
        prisma,
        tenantId,
        'contact',
        created.id,
        created as unknown as Record<string, unknown>,
        created.ownerId,
        'system'
      );

      updateContactDataQuality(prisma, created.id).catch(() => undefined);

      // Auto-enrichment (fire-and-forget): only when a provider key is configured
      // so we never churn EnrichmentJob rows or block the create otherwise.
      if (process.env.CLEARBIT_API_KEY || process.env.APOLLO_API_KEY) {
        void enrichContact(prisma, tenantId, created.id, producer).catch(() => undefined);
      }

      return created;
    },

    async updateContact(
      tenantId: string,
      id: string,
      data: UpdateContactInput,
      changedBy?: string,
      changedByName?: string,
      roles?: string[]
    ): Promise<Contact> {
      const existing = await loadOrThrow(tenantId, id);

      if (data.accountId && data.accountId !== existing.accountId) {
        const account = await prisma.account.findFirst({
          where: { id: data.accountId, tenantId },
        });
        if (!account) throw new NotFoundError('Account', data.accountId);
      }
      // Recompute the blind index when the email is part of the patch, and dedup
      // against it (never against the possibly-encrypted raw `email` column).
      const nextEmailHash =
        data.email !== undefined ? (data.email ? computeBlindIndex(data.email) : null) : undefined;
      if (data.email && data.email !== existing.email) {
        const dup = await prisma.contact.findFirst({
          where: { emailHash: nextEmailHash, tenantId, NOT: { id } },
        });
        if (dup) throw new ConflictError('Contact', 'email');
      }

      const oldValues: Record<string, unknown> = {};
      const update: Prisma.ContactUpdateInput = {};
      const fields: (keyof UpdateContactInput)[] = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'mobile',
        'jobTitle',
        'department',
        'linkedInUrl',
        'twitterHandle',
        'country',
        'city',
        'address',
        'timezone',
        'preferredChannel',
        'doNotEmail',
        'doNotCall',
        'ownerId',
        'isActive',
      ];
      for (const f of fields) {
        if (data[f] !== undefined) {
          (update as Record<string, unknown>)[f] = data[f];
          (oldValues as Record<string, unknown>)[f] = (existing as Record<string, unknown>)[f];
        }
      }
      if (data.accountId !== undefined) {
        if (!data.accountId) {
          throw new BusinessRuleError('Contact must remain linked to an account');
        }
        oldValues.accountId = existing.accountId;
        update.account = { connect: { id: data.accountId } };
      }
      if (data.gdprConsent !== undefined) {
        oldValues.gdprConsent = existing.gdprConsent;
        oldValues.gdprConsentAt = existing.gdprConsentAt;
        update.gdprConsent = data.gdprConsent;
        if (data.gdprConsent) update.gdprConsentAt = new Date();
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
        oldValues.customFields = existing.customFields;
      }
      if (data.tags !== undefined) { update.tags = data.tags; oldValues.tags = existing.tags; }

      // FieldPermission: strip fields the caller may not write (fail-open).
      const permResult = await applyFieldPermissions(
        prisma,
        tenantId,
        'contact',
        update as Record<string, unknown>,
        roles
      );
      const safeUpdate = permResult.update as Prisma.ContactUpdateInput;

      // Keep the blind index in lockstep with the (possibly permission-stripped)
      // email write: only persist emailHash if `email` actually survived to the
      // update, so the index can never drift from the stored value.
      if (nextEmailHash !== undefined && 'email' in (safeUpdate as Record<string, unknown>)) {
        (safeUpdate as Record<string, unknown>).emailHash = nextEmailHash;
      }

      // Validation rules run against the post-write record (existing + patch).
      await enforceValidationRules(
        prisma,
        tenantId,
        'contact',
        mergeForValidation(existing as Record<string, unknown>, safeUpdate as Record<string, unknown>)
      );

      // Low-code governance: validate incoming customFields (422 on violation, fail-open).
      if (data.customFields !== undefined) {
        await validateCustomFields(prisma, tenantId, 'contact', data.customFields);
      }

      const updated = await prisma.contact.update({ where: { id }, data: safeUpdate });
      if (changedBy) {
        await recordFieldChanges(prisma, tenantId, 'contact', id, oldValues, data as Record<string, unknown>, changedBy, changedByName);
      }
      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.updated',
          tenantId,
          payload: {
            id: updated.id,
            contactId: updated.id,
            firstName: updated.firstName,
            lastName: updated.lastName,
            email: updated.email ?? undefined,
            accountId: updated.accountId ?? undefined,
            ownerId: updated.ownerId,
            changedFields: Object.keys(oldValues),
          },
        })
        .catch(() => undefined);
      updateContactDataQuality(prisma, id).catch(() => undefined);
      return updated;
    },

    async mergeContacts(
      tenantId: string,
      primaryId: string,
      secondaryId: string,
      fieldChoices: Record<string, string>,
      changedBy?: string
    ): Promise<Contact> {
      const [primary, secondary] = await Promise.all([
        loadOrThrow(tenantId, primaryId),
        loadOrThrow(tenantId, secondaryId),
      ]);
      const mergedData: Prisma.ContactUpdateInput = {};
      for (const [field, sourceId] of Object.entries(fieldChoices)) {
        if (sourceId === primaryId) {
          (mergedData as Record<string, unknown>)[field] = (primary as Record<string, unknown>)[field];
        } else if (sourceId === secondaryId) {
          (mergedData as Record<string, unknown>)[field] = (secondary as Record<string, unknown>)[field];
        }
      }
      await prisma.$transaction([
        prisma.activity.updateMany({ where: { contactId: secondaryId, tenantId }, data: { contactId: primaryId } }),
        prisma.note.updateMany({ where: { contactId: secondaryId, tenantId }, data: { contactId: primaryId } }),
        prisma.dealContact.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }),
        prisma.contact.update({ where: { id: primaryId }, data: mergedData }),
        prisma.contact.update({ where: { id: secondaryId }, data: { deletedAt: new Date(), isActive: false } }),
      ]);
      // Full history: mark the merge on the surviving (primary) record.
      await recordSingleChange(
        prisma,
        tenantId,
        'contact',
        primaryId,
        'merged',
        null,
        secondaryId,
        changedBy ?? primary.ownerId,
        changedBy ? undefined : 'system'
      );
      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.merged',
          tenantId,
          payload: {
            contactId: primaryId,
            mergedFromId: secondaryId,
            accountId: primary.accountId ?? undefined,
          },
        })
        .catch(() => undefined);
      return prisma.contact.findFirstOrThrow({ where: { id: primaryId, tenantId } });
    },

    /** Soft-deletes by setting `deletedAt`. */
    async deleteContact(tenantId: string, id: string): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.deletedAt) return;
      await prisma.contact.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await recordSingleChange(
        prisma,
        tenantId,
        'contact',
        id,
        'status',
        'active',
        'archived',
        existing.ownerId,
        'system'
      );
      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.archived',
          tenantId,
          payload: {
            contactId: existing.id,
            accountId: existing.accountId ?? undefined,
            ownerId: existing.ownerId,
          },
        })
        .catch(() => undefined);
    },

    async restoreContact(tenantId: string, id: string): Promise<Contact> {
      const result = await prisma.contact.updateMany({
        where: { id, tenantId, deletedAt: { not: null } },
        data: { deletedAt: null, isActive: true },
      });
      if (result.count === 0) throw new NotFoundError('Contact', id);
      const restored = await prisma.contact.findFirstOrThrow({ where: { id, tenantId } });
      await recordSingleChange(
        prisma,
        tenantId,
        'contact',
        id,
        'status',
        'archived',
        'active',
        restored.ownerId,
        'system'
      );
      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.restored',
          tenantId,
          payload: {
            contactId: restored.id,
            accountId: restored.accountId ?? undefined,
            ownerId: restored.ownerId,
          },
        })
        .catch(() => undefined);
      return restored;
    },

    async listContactDeals(
      tenantId: string,
      contactId: string,
      opts: { page?: number; limit?: number } = {}
    ): Promise<{ data: Deal[]; total: number }> {
      await loadOrThrow(tenantId, contactId);
      const page = Math.max(1, opts.page ?? 1);
      const limit = Math.min(100, opts.limit ?? 25);
      const skip = (page - 1) * limit;

      const [items, total] = await prisma.$transaction([
        prisma.deal.findMany({
          where: {
            tenantId,
            contacts: { some: { contactId } },
          },
          include: {
            stage: true,
            account: { select: { id: true, name: true } },
          },
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.deal.count({
          where: { tenantId, contacts: { some: { contactId } } },
        }),
      ]);
      return { data: items, total };
    },

    async getContactTimeline(
      tenantId: string,
      contactId: string,
      opts: { cursor?: string; limit?: number } = {}
    ): Promise<{ events: TimelineEvent[]; nextCursor: string | null }> {
      await loadOrThrow(tenantId, contactId);
      const limit = Math.min(50, opts.limit ?? 20);

      const [activities, notes] = await Promise.all([
        prisma.activity.findMany({
          where: { tenantId, contactId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
        prisma.note.findMany({
          where: { tenantId, contactId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),
      ]);

      const events: TimelineEvent[] = [
        ...activities.map((a) => ({
          id: `activity-${a.id}`,
          type: 'ACTIVITY' as const,
          at: a.createdAt.toISOString(),
          title: `${a.type}: ${a.subject}`,
          description: a.description ?? undefined,
          metadata: {
            status: a.status,
            dueDate: a.dueDate?.toISOString() ?? undefined,
            activityType: a.type,
          },
        })),
        ...notes.map((n) => ({
          id: `note-${n.id}`,
          type: 'NOTE' as const,
          at: n.createdAt.toISOString(),
          title: n.isPinned ? '📌 Pinned note' : 'Note',
          description: n.content,
          metadata: { isPinned: n.isPinned },
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);

      return { events, nextCursor: null };
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;
