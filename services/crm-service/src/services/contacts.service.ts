import type { PaginatedResult } from '@nexus/shared-types';
import { ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  ContactListQuery,
  CreateContactInput,
  UpdateContactInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { Contact } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

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
      pagination: ListPagination
    ): Promise<PaginatedResult<Contact>> {
      const where = buildWhere(tenantId, filters);
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
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getContactById(tenantId: string, id: string): Promise<Contact> {
      return loadOrThrow(tenantId, id);
    },

    async createContact(tenantId: string, data: CreateContactInput): Promise<Contact> {
      if (data.accountId) {
        const account = await prisma.account.findFirst({
          where: { id: data.accountId, tenantId },
        });
        if (!account) throw new NotFoundError('Account', data.accountId);
      }
      if (data.email) {
        const existing = await prisma.contact.findFirst({
          where: { email: data.email, tenantId },
        });
        if (existing) throw new ConflictError('Contact', 'email');
      }

      const created = await prisma.contact.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          accountId: data.accountId ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? null,
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
        },
      });

      await producer
        .publish(TOPICS.CONTACTS, {
          type: 'contact.created',
          tenantId,
          payload: {
            contactId: created.id,
            email: created.email ?? undefined,
            accountId: created.accountId ?? undefined,
          },
        })
        .catch(() => undefined);

      return created;
    },

    async updateContact(
      tenantId: string,
      id: string,
      data: UpdateContactInput
    ): Promise<Contact> {
      const existing = await loadOrThrow(tenantId, id);

      if (data.accountId && data.accountId !== existing.accountId) {
        const account = await prisma.account.findFirst({
          where: { id: data.accountId, tenantId },
        });
        if (!account) throw new NotFoundError('Account', data.accountId);
      }
      if (data.email && data.email !== existing.email) {
        const dup = await prisma.contact.findFirst({
          where: { email: data.email, tenantId, NOT: { id } },
        });
        if (dup) throw new ConflictError('Contact', 'email');
      }

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
        }
      }
      if (data.accountId !== undefined) {
        update.account = data.accountId
          ? { connect: { id: data.accountId } }
          : { disconnect: true };
      }
      if (data.gdprConsent !== undefined) {
        update.gdprConsent = data.gdprConsent;
        if (data.gdprConsent) update.gdprConsentAt = new Date();
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }
      if (data.tags !== undefined) update.tags = data.tags;

      return prisma.contact.update({ where: { id }, data: update });
    },

    /** Soft-deletes by flipping `isActive=false`. */
    async deleteContact(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.contact.update({ where: { id }, data: { isActive: false } });
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;
