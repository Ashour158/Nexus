import type { PaginatedResult } from '@nexus/shared-types';
import { ConflictError, NotFoundError, ValidationError, createCodingClient } from '@nexus/service-utils';
import type { CreateContactInput, UpdateContactInput, ContactListQuery } from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/contacts-client/index.js';
import type {
  Contact,
  ConsentRecord,
  ContactAuditEvent,
  ContactDocument,
  ContactFieldHistory,
  ContactMailThread,
  OutboxMessage,
} from '../../../../node_modules/.prisma/contacts-client/index.js';
import type { ContactsPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';

type ContactListFilters = Omit<ContactListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;
type Tx = Prisma.TransactionClient;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export interface ContactDocumentInput {
  name: string;
  type?: string;
  mimeType: string;
  size?: number;
  storageKey: string;
  checksum?: string;
  retentionCategory?: string;
}

export interface ContactMailThreadInput {
  provider: string;
  externalId: string;
  subject: string;
  fromEmail?: string;
  toEmails?: string[];
  messageCount?: number;
  lastMessageAt?: Date;
  snippet?: string;
  isRead?: boolean;
}

export interface ConsentRecordInput {
  channel: string;
  status: string;
  source?: string;
  ipAddress?: string;
  expiresAt?: Date;
  notes?: string;
}

const codingClient = createCodingClient({ baseURL: process.env.METADATA_SERVICE_URL ?? 'http://localhost:3004' });

const allowedLifecycleTransitions: Record<string, string[]> = {
  'New relationship': ['Business champion', 'Technical evaluator', 'Executive sponsor', 'Dormant', 'Archived'],
  'Business champion': ['Executive sponsor', 'Technical evaluator', 'Dormant', 'Archived'],
  'Technical evaluator': ['Business champion', 'Executive sponsor', 'Dormant', 'Archived'],
  'Executive sponsor': ['Business champion', 'Dormant', 'Archived'],
  Dormant: ['New relationship', 'Business champion', 'Archived'],
  Archived: ['New relationship', 'Dormant'],
};

const governedFields: Array<keyof UpdateContactInput> = [
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
  'accountId',
  'gdprConsent',
  'isActive',
  'customFields',
  'tags',
];

function buildWhere(tenantId: string, filters: ContactListFilters): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { tenantId };
  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.ownerId) where.ownerId = filters.ownerId;
  // Default to excluding archived ("deleted") contacts; callers can pass
  // isActive: false explicitly to see archived records.
  where.isActive = filters.isActive !== undefined ? filters.isActive : true;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { mobile: { contains: q, mode: 'insensitive' } },
      { jobTitle: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(sortBy: string | undefined): keyof Prisma.ContactOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'lastName', 'firstName', 'relationshipScore']);
  return (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.ContactOrderByWithRelationInput;
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePhone(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function normalizeName(firstName: unknown, lastName: unknown) {
  return `${String(firstName ?? '').trim().toLowerCase()} ${String(lastName ?? '').trim().toLowerCase()}`.trim();
}

function inferBuyingRole(data: { jobTitle?: string | null; department?: string | null }) {
  const text = `${data.jobTitle ?? ''} ${data.department ?? ''}`.toLowerCase();
  if (text.includes('chief') || text.includes('vp') || text.includes('head')) return 'Decision maker';
  if (text.includes('procurement') || text.includes('finance')) return 'Economic buyer';
  if (text.includes('technology') || text.includes('engineer')) return 'Technical evaluator';
  return 'Stakeholder';
}

function inferInfluenceLevel(role: string) {
  if (role === 'Decision maker' || role === 'Economic buyer') return 'High';
  if (role === 'Technical evaluator') return 'Medium';
  return 'Standard';
}

function calculateSlaStatus(lastContactedAt?: Date | null) {
  if (!lastContactedAt) return 'needs-first-touch';
  const days = Math.floor((Date.now() - lastContactedAt.getTime()) / 86_400_000);
  if (days <= 3) return 'healthy';
  if (days <= 10) return 'watch';
  return 'breached';
}

function calculateRelationshipScore(contact: {
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  gdprConsent?: boolean | null;
  lastContactedAt?: Date | null;
}) {
  let score = 30;
  if (contact.email) score += 10;
  if (contact.phone || contact.mobile) score += 10;
  if (contact.gdprConsent) score += 10;
  if (contact.lastContactedAt) score += 15;
  return Math.min(score, 100);
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (value instanceof Date) return value.toISOString();
  return value as Prisma.InputJsonValue;
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}

function buildDuplicateWhere(
  tenantId: string,
  candidate: { email?: string | null; phone?: string | null; mobile?: string | null; firstName?: string; lastName?: string; accountId?: string },
  excludeId?: string
): Prisma.ContactWhereInput {
  const or: Prisma.ContactWhereInput[] = [];
  const email = normalizeEmail(candidate.email);
  if (email) or.push({ email: { equals: email, mode: 'insensitive' } });
  const phone = normalizePhone(candidate.phone ?? candidate.mobile);
  if (phone) or.push({ OR: [{ phone: { contains: phone } }, { mobile: { contains: phone } }] });
  const name = normalizeName(candidate.firstName, candidate.lastName);
  if (name && candidate.accountId) {
    or.push({
      accountId: candidate.accountId,
      firstName: { equals: candidate.firstName ?? '', mode: 'insensitive' },
      lastName: { equals: candidate.lastName ?? '', mode: 'insensitive' },
    });
  }
  return {
    tenantId,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
    ...(or.length > 0 ? { OR: or } : { id: '__no_duplicate_candidate__' }),
  };
}

function ensureLifecycleTransition(from: string, to: string) {
  if (from === to) return;
  if (!allowedLifecycleTransitions[from]?.includes(to)) {
    throw new ValidationError('Invalid lifecycle transition', { from, to });
  }
}

async function writeAudit(
  tx: Tx,
  tenantId: string,
  contactId: string,
  action: string,
  actorId: string,
  metadata: Prisma.InputJsonObject = {}
) {
  await tx.contactAuditEvent.create({
    data: { tenantId, contactId, action, actorId, metadata },
  });
}

async function writeOutbox(
  tx: Tx,
  topic: string,
  tenantId: string,
  contactId: string,
  payload: Prisma.InputJsonObject,
  actorId: string
) {
  await tx.outboxMessage.create({
    data: {
      topic,
      tenantId,
      eventType: topic,
      aggregateId: contactId,
      payload: { tenantId, contactId, ...payload },
      headers: { actorId },
      correlationId: contactId,
    },
  });
}

async function writeFieldHistory(
  tx: Tx,
  tenantId: string,
  contactId: string,
  actorId: string,
  existing: Contact,
  patch: UpdateContactInput
) {
  const rows = governedFields
    .filter((field) => patch[field] !== undefined)
    .filter((field) => JSON.stringify(existing[field as keyof Contact]) !== JSON.stringify(patch[field]))
    .map((field) => ({
      tenantId,
      contactId,
      fieldName: String(field),
      oldValue: jsonValue(existing[field as keyof Contact]),
      newValue: jsonValue(patch[field]),
      changedBy: actorId,
    }));
  if (rows.length > 0) await tx.contactFieldHistory.createMany({ data: rows });
  return rows.map((row) => row.fieldName);
}

function buildContactUpdate(data: UpdateContactInput, existing: Contact): Prisma.ContactUpdateInput {
  const update: Prisma.ContactUpdateInput = {};
  const scalarFields: Array<keyof UpdateContactInput> = [
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

  for (const field of scalarFields) {
    if (data[field] !== undefined) (update as Record<string, unknown>)[field] = data[field];
  }
  if (data.accountId !== undefined) update.account = { connect: { id: data.accountId } };
  if (data.gdprConsent !== undefined) {
    update.gdprConsent = data.gdprConsent;
    update.gdprConsentAt = data.gdprConsent ? new Date() : null;
  }
  if (data.customFields !== undefined) update.customFields = data.customFields as Prisma.InputJsonValue;
  if (data.tags !== undefined) update.tags = data.tags;

  const lifecycleStage = String(jsonObject(data.customFields).lifecycleStage ?? existing.lifecycleStage);
  const buyingRole = String(jsonObject(data.customFields).buyingCommitteeRole ?? existing.buyingCommitteeRole ?? inferBuyingRole({ ...existing, ...data }));
  update.lifecycleStage = lifecycleStage;
  update.buyingCommitteeRole = buyingRole;
  update.influenceLevel = String(jsonObject(data.customFields).influenceLevel ?? existing.influenceLevel ?? inferInfluenceLevel(buyingRole));
  update.slaStatus = calculateSlaStatus(existing.lastContactedAt);
  update.relationshipScore = calculateRelationshipScore({ ...existing, ...data });
  update.version = { increment: 1 };
  return update;
}

export function createContactsService(prisma: ContactsPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Contact> {
    const row = await prisma.contact.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Contact', id);
    return row;
  }

  async function assertNoDuplicate(
    tenantId: string,
    candidate: { email?: string | null; phone?: string | null; mobile?: string | null; firstName?: string; lastName?: string; accountId?: string },
    excludeId?: string
  ) {
    const duplicate = await prisma.contact.findFirst({ where: buildDuplicateWhere(tenantId, candidate, excludeId) });
    if (duplicate) throw new ConflictError('Contact', 'duplicate');
  }

  return {
    async listContacts(
      tenantId: string,
      filters: ContactListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Contact>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.ContactOrderByWithRelationInput = { [sortField]: pagination.sortDir };
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
      // loadOrThrow deliberately ignores isActive (archive/restore/merge need to
      // load inactive records) — the public read path must not expose archived
      // ("deleted") contacts, so enforce it here.
      const row = await loadOrThrow(tenantId, id);
      if (!row.isActive) throw new NotFoundError('Contact', id);
      return row;
    },

    async createContact(tenantId: string, data: CreateContactInput, actorId: string, idempotencyKey?: string): Promise<Contact> {
      if (idempotencyKey) {
        const existing = await prisma.contact.findFirst({
          where: { tenantId, customFields: { path: ['idempotencyKey'], equals: idempotencyKey } },
        });
        if (existing) return existing;
      }

      const account = await prisma.account.findFirst({ where: { id: data.accountId, tenantId } });
      if (!account) throw new NotFoundError('Account', data.accountId);
      await assertNoDuplicate(tenantId, data);

      const code = data.code ?? await codingClient.allocateCode(tenantId, 'CONTACT', { ownerId: data.ownerId });
      const buyingCommitteeRole = String(jsonObject(data.customFields).buyingCommitteeRole ?? inferBuyingRole(data));
      const lifecycleStage = String(jsonObject(data.customFields).lifecycleStage ?? 'New relationship');
      const created = await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: {
            tenantId,
            ownerId: data.ownerId,
            accountId: data.accountId,
            code,
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
            lifecycleStage,
            buyingCommitteeRole,
            influenceLevel: String(jsonObject(data.customFields).influenceLevel ?? inferInfluenceLevel(buyingCommitteeRole)),
            relationshipScore: calculateRelationshipScore(data),
            slaStatus: calculateSlaStatus(null),
            doNotEmail: data.doNotEmail ?? false,
            doNotCall: data.doNotCall ?? false,
            gdprConsent: data.gdprConsent ?? false,
            gdprConsentAt: data.gdprConsent ? new Date() : null,
            customFields: { ...jsonObject(data.customFields), idempotencyKey: idempotencyKey ?? null },
            tags: data.tags,
          },
        });
        await writeAudit(tx, tenantId, contact.id, 'Contact created', actorId, { accountId: contact.accountId, code });
        await tx.contactLifecycleEvent.create({
          data: { tenantId, contactId: contact.id, toStage: lifecycleStage, actorId, reason: 'Created' },
        });
        await writeOutbox(tx, 'contact.created', tenantId, contact.id, { email: contact.email, accountId: contact.accountId }, actorId);
        return contact;
      });

      await producer.publish(TOPICS.CONTACTS, {
        type: 'contact.created',
        tenantId,
        payload: { contactId: created.id, email: created.email ?? undefined, accountId: created.accountId },
      }).catch(() => undefined);
      return created;
    },

    async updateContact(tenantId: string, id: string, data: UpdateContactInput, actorId: string): Promise<Contact> {
      const existing = await loadOrThrow(tenantId, id);
      if (data.accountId && data.accountId !== existing.accountId) {
        const account = await prisma.account.findFirst({ where: { id: data.accountId, tenantId } });
        if (!account) throw new NotFoundError('Account', data.accountId);
      }
      await assertNoDuplicate(tenantId, { ...existing, ...data }, id);
      const nextLifecycle = String(jsonObject(data.customFields).lifecycleStage ?? existing.lifecycleStage);
      ensureLifecycleTransition(existing.lifecycleStage, nextLifecycle);

      return prisma.$transaction(async (tx) => {
        const changedFields = await writeFieldHistory(tx, tenantId, id, actorId, existing, data);
        if (nextLifecycle !== existing.lifecycleStage) {
          await tx.contactLifecycleEvent.create({
            data: { tenantId, contactId: id, fromStage: existing.lifecycleStage, toStage: nextLifecycle, actorId, reason: 'Updated' },
          });
        }
        const updated = await tx.contact.update({ where: { id }, data: buildContactUpdate(data, existing) });
        await writeAudit(tx, tenantId, id, 'Contact updated', actorId, { changedFields });
        await writeOutbox(tx, 'contact.updated', tenantId, id, { changedFields }, actorId);
        return updated;
      });
    },

    async archiveContact(tenantId: string, id: string, actorId: string, reason: string): Promise<Contact> {
      const existing = await loadOrThrow(tenantId, id);
      ensureLifecycleTransition(existing.lifecycleStage, 'Archived');
      return prisma.$transaction(async (tx) => {
        const archived = await tx.contact.update({
          where: { id },
          data: {
            isActive: false,
            archivedAt: new Date(),
            archivedBy: actorId,
            archiveReason: reason,
            lifecycleStage: 'Archived',
            version: { increment: 1 },
          },
        });
        await tx.contactLifecycleEvent.create({
          data: { tenantId, contactId: id, fromStage: existing.lifecycleStage, toStage: 'Archived', actorId, reason },
        });
        await writeAudit(tx, tenantId, id, 'Contact archived', actorId, { reason });
        await writeOutbox(tx, 'contact.archived', tenantId, id, { reason }, actorId);
        return archived;
      });
    },

    async restoreContact(tenantId: string, id: string, actorId: string): Promise<Contact> {
      const existing = await loadOrThrow(tenantId, id);
      ensureLifecycleTransition(existing.lifecycleStage, 'New relationship');
      return prisma.$transaction(async (tx) => {
        const restored = await tx.contact.update({
          where: { id },
          data: {
            isActive: true,
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
            lifecycleStage: 'New relationship',
            version: { increment: 1 },
          },
        });
        await tx.contactLifecycleEvent.create({
          data: { tenantId, contactId: id, fromStage: existing.lifecycleStage, toStage: 'New relationship', actorId, reason: 'Restored' },
        });
        await writeAudit(tx, tenantId, id, 'Contact restored', actorId);
        await writeOutbox(tx, 'contact.restored', tenantId, id, {}, actorId);
        return restored;
      });
    },

    async deleteContact(tenantId: string, id: string, actorId: string): Promise<void> {
      await this.archiveContact(tenantId, id, actorId, 'Deleted through contacts API');
    },

    async attachDocument(tenantId: string, contactId: string, input: ContactDocumentInput, actorId: string): Promise<ContactDocument> {
      await loadOrThrow(tenantId, contactId);
      return prisma.$transaction(async (tx) => {
        const document = await tx.contactDocument.create({
          data: {
            tenantId,
            contactId,
            name: input.name,
            type: input.type ?? 'General',
            mimeType: input.mimeType,
            size: input.size ?? 0,
            storageKey: input.storageKey,
            checksum: input.checksum ?? null,
            scanStatus: 'PENDING',
            retentionCategory: input.retentionCategory ?? 'customer-record',
            uploadedBy: actorId,
          },
        });
        await writeAudit(tx, tenantId, contactId, 'Document attached', actorId, { documentId: document.id, name: document.name });
        await writeOutbox(tx, 'contact.document_attached', tenantId, contactId, { documentId: document.id }, actorId);
        return document;
      });
    },

    async listDocuments(tenantId: string, contactId: string): Promise<ContactDocument[]> {
      await loadOrThrow(tenantId, contactId);
      return prisma.contactDocument.findMany({
        where: { tenantId, contactId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async upsertMailThread(tenantId: string, contactId: string, input: ContactMailThreadInput, actorId: string): Promise<ContactMailThread> {
      await loadOrThrow(tenantId, contactId);
      const thread = await prisma.contactMailThread.upsert({
        where: { tenantId_provider_externalId: { tenantId, provider: input.provider, externalId: input.externalId } },
        update: {
          contactId,
          subject: input.subject,
          fromEmail: input.fromEmail ?? null,
          toEmails: input.toEmails ?? [],
          messageCount: input.messageCount ?? 1,
          lastMessageAt: input.lastMessageAt ?? new Date(),
          snippet: input.snippet ?? null,
          isRead: input.isRead ?? false,
        },
        create: {
          tenantId,
          contactId,
          provider: input.provider,
          externalId: input.externalId,
          subject: input.subject,
          fromEmail: input.fromEmail ?? null,
          toEmails: input.toEmails ?? [],
          messageCount: input.messageCount ?? 1,
          lastMessageAt: input.lastMessageAt ?? new Date(),
          snippet: input.snippet ?? null,
          isRead: input.isRead ?? false,
        },
      });
      await prisma.contactAuditEvent.create({
        data: { tenantId, contactId, action: 'Mail thread synchronized', actorId, metadata: { threadId: thread.id } },
      });
      return thread;
    },

    async listMailThreads(tenantId: string, contactId: string): Promise<ContactMailThread[]> {
      await loadOrThrow(tenantId, contactId);
      return prisma.contactMailThread.findMany({
        where: { tenantId, contactId, deletedAt: null },
        orderBy: { lastMessageAt: 'desc' },
      });
    },

    async listFieldHistory(tenantId: string, contactId: string): Promise<ContactFieldHistory[]> {
      await loadOrThrow(tenantId, contactId);
      return prisma.contactFieldHistory.findMany({ where: { tenantId, contactId }, orderBy: { changedAt: 'desc' } });
    },

    async listAuditEvents(tenantId: string, contactId: string): Promise<ContactAuditEvent[]> {
      await loadOrThrow(tenantId, contactId);
      return prisma.contactAuditEvent.findMany({ where: { tenantId, contactId }, orderBy: { occurredAt: 'desc' } });
    },

    async listOutboxEvents(contactId: string): Promise<OutboxMessage[]> {
      return prisma.outboxMessage.findMany({ where: { aggregateId: contactId }, orderBy: { createdAt: 'desc' } });
    },

    /**
     * GDPR governance: record a consent grant/withdrawal for a channel. Upserts
     * on (tenantId, contactId, channel) so the latest state per channel is
     * authoritative, keeps grantedAt/withdrawnAt in step with the status, and
     * keeps the contact's gdprConsent flag coherent for the email channel.
     */
    async recordConsent(
      tenantId: string,
      contactId: string,
      input: ConsentRecordInput,
      actorId: string
    ): Promise<ConsentRecord> {
      await loadOrThrow(tenantId, contactId);
      const now = new Date();
      const granted = input.status.toLowerCase() === 'granted';
      const withdrawn = input.status.toLowerCase() === 'withdrawn';
      return prisma.$transaction(async (tx) => {
        const record = await tx.consentRecord.upsert({
          where: { tenantId_contactId_channel: { tenantId, contactId, channel: input.channel } },
          update: {
            status: input.status,
            source: input.source ?? null,
            ipAddress: input.ipAddress ?? null,
            expiresAt: input.expiresAt ?? null,
            notes: input.notes ?? null,
            recordedBy: actorId,
            grantedAt: granted ? now : undefined,
            withdrawnAt: withdrawn ? now : undefined,
          },
          create: {
            tenantId,
            contactId,
            channel: input.channel,
            status: input.status,
            source: input.source ?? null,
            ipAddress: input.ipAddress ?? null,
            expiresAt: input.expiresAt ?? null,
            notes: input.notes ?? null,
            recordedBy: actorId,
            grantedAt: granted ? now : null,
            withdrawnAt: withdrawn ? now : null,
          },
        });
        if (input.channel.toLowerCase() === 'email') {
          await tx.contact.update({
            where: { id: contactId },
            data: { gdprConsent: granted, gdprConsentAt: granted ? now : null },
          });
        }
        await writeAudit(tx, tenantId, contactId, 'Consent recorded', actorId, {
          channel: input.channel,
          status: input.status,
        });
        await writeOutbox(tx, 'contact.consent_recorded', tenantId, contactId, {
          channel: input.channel,
          status: input.status,
        }, actorId);
        return record;
      });
    },

    async listConsents(tenantId: string, contactId: string): Promise<ConsentRecord[]> {
      await loadOrThrow(tenantId, contactId);
      return prisma.consentRecord.findMany({
        where: { tenantId, contactId },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async listTimeline(tenantId: string, contactId: string): Promise<Array<Record<string, unknown>>> {
      await loadOrThrow(tenantId, contactId);
      const [audit, fieldHistory, documents, mailThreads, lifecycle] = await Promise.all([
        prisma.contactAuditEvent.findMany({ where: { tenantId, contactId }, orderBy: { occurredAt: 'desc' } }),
        prisma.contactFieldHistory.findMany({ where: { tenantId, contactId }, orderBy: { changedAt: 'desc' } }),
        prisma.contactDocument.findMany({ where: { tenantId, contactId, deletedAt: null }, orderBy: { updatedAt: 'desc' } }),
        prisma.contactMailThread.findMany({ where: { tenantId, contactId, deletedAt: null }, orderBy: { lastMessageAt: 'desc' } }),
        prisma.contactLifecycleEvent.findMany({ where: { tenantId, contactId }, orderBy: { occurredAt: 'desc' } }),
      ]);
      return [
        ...audit.map((item) => ({ id: item.id, type: 'audit', title: item.action, at: item.occurredAt, source: item })),
        ...fieldHistory.map((item) => ({ id: item.id, type: 'field-history', title: `Field changed: ${item.fieldName}`, at: item.changedAt, source: item })),
        ...documents.map((item) => ({ id: item.id, type: 'document', title: item.name, at: item.updatedAt, source: item })),
        ...mailThreads.map((item) => ({ id: item.id, type: 'mail', title: item.subject, at: item.lastMessageAt, source: item })),
        ...lifecycle.map((item) => ({ id: item.id, type: 'lifecycle', title: `Lifecycle: ${item.toStage}`, at: item.occurredAt, source: item })),
      ].sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime());
    },

    async findDuplicates(
      tenantId: string,
      candidate: { id?: string; email?: string | null; phone?: string | null; mobile?: string | null; firstName?: string; lastName?: string; accountId?: string }
    ): Promise<Contact[]> {
      return prisma.contact.findMany({ where: buildDuplicateWhere(tenantId, candidate, candidate.id) });
    },

    async scanDuplicates(tenantId: string): Promise<Array<{ key: string; reason: string; contacts: Contact[] }>> {
      const contacts = await prisma.contact.findMany({ where: { tenantId, isActive: true }, orderBy: { updatedAt: 'desc' } });
      const groups = new Map<string, { reason: string; contacts: Contact[] }>();
      for (const contact of contacts) {
        const email = normalizeEmail(contact.email);
        if (email) {
          const key = `email:${email}`;
          const group = groups.get(key) ?? { reason: 'Same email address', contacts: [] };
          group.contacts.push(contact);
          groups.set(key, group);
        }
        const accountName = `${contact.accountId}:${normalizeName(contact.firstName, contact.lastName)}`;
        if (accountName.length > contact.accountId.length + 1) {
          const key = `account-name:${accountName}`;
          const group = groups.get(key) ?? { reason: 'Same account and contact name', contacts: [] };
          group.contacts.push(contact);
          groups.set(key, group);
        }
      }
      return Array.from(groups.entries())
        .filter(([, group]) => group.contacts.length > 1)
        .map(([key, group]) => ({ key, ...group }));
    },

    async mergeContacts(tenantId: string, masterContactId: string, duplicateContactId: string, actorId: string): Promise<Contact> {
      if (masterContactId === duplicateContactId) throw new ValidationError('Cannot merge a contact into itself');
      const [master, duplicate] = await Promise.all([
        loadOrThrow(tenantId, masterContactId),
        loadOrThrow(tenantId, duplicateContactId),
      ]);
      return prisma.$transaction(async (tx) => {
        const merged = await tx.contact.update({
          where: { id: master.id },
          data: {
            phone: master.phone ?? duplicate.phone,
            mobile: master.mobile ?? duplicate.mobile,
            jobTitle: master.jobTitle ?? duplicate.jobTitle,
            department: master.department ?? duplicate.department,
            country: master.country ?? duplicate.country,
            city: master.city ?? duplicate.city,
            address: master.address ?? duplicate.address,
            tags: Array.from(new Set([...master.tags, ...duplicate.tags])),
            version: { increment: 1 },
          },
        });
        // Reparent the duplicate's child rows onto the master so they are not
        // orphaned on the tombstone. Simple 1:N children move unconditionally.
        const reparented: Record<string, number> = {};
        reparented.notes = (await tx.note.updateMany({
          where: { tenantId, contactId: duplicate.id },
          data: { contactId: master.id },
        })).count;
        reparented.documents = (await tx.contactDocument.updateMany({
          where: { tenantId, contactId: duplicate.id },
          data: { contactId: master.id },
        })).count;
        reparented.auditEvents = (await tx.contactAuditEvent.updateMany({
          where: { tenantId, contactId: duplicate.id },
          data: { contactId: master.id },
        })).count;
        reparented.fieldHistory = (await tx.contactFieldHistory.updateMany({
          where: { tenantId, contactId: duplicate.id },
          data: { contactId: master.id },
        })).count;
        reparented.lifecycleEvents = (await tx.contactLifecycleEvent.updateMany({
          where: { tenantId, contactId: duplicate.id },
          data: { contactId: master.id },
        })).count;

        // Mail threads and consent records carry composite unique constraints
        // ((tenantId, provider, externalId) and (tenantId, contactId, channel)),
        // so a blind updateMany could collide with an existing master row.
        // Move only the rows whose key is not already present on the master.
        const dupThreads = await tx.contactMailThread.findMany({
          where: { tenantId, contactId: duplicate.id, deletedAt: null },
          select: { id: true, provider: true, externalId: true },
        });
        for (const thread of dupThreads) {
          const clash = await tx.contactMailThread.findFirst({
            where: { tenantId, contactId: master.id, provider: thread.provider, externalId: thread.externalId },
            select: { id: true },
          });
          if (!clash) {
            await tx.contactMailThread.update({ where: { id: thread.id }, data: { contactId: master.id } });
            reparented.mailThreads = (reparented.mailThreads ?? 0) + 1;
          }
        }

        const dupConsents = await tx.consentRecord.findMany({
          where: { tenantId, contactId: duplicate.id },
          select: { id: true, channel: true },
        });
        for (const consent of dupConsents) {
          const clash = await tx.consentRecord.findFirst({
            where: { tenantId, contactId: master.id, channel: consent.channel },
            select: { id: true },
          });
          if (!clash) {
            await tx.consentRecord.update({ where: { id: consent.id }, data: { contactId: master.id } });
            reparented.consents = (reparented.consents ?? 0) + 1;
          }
        }

        await tx.contact.update({
          where: { id: duplicate.id },
          data: {
            isActive: false,
            archivedAt: new Date(),
            archivedBy: actorId,
            archiveReason: `Merged into ${master.id}`,
            mergedIntoContactId: master.id,
            lifecycleStage: 'Archived',
          },
        });
        await writeAudit(tx, tenantId, master.id, 'Contact merged', actorId, { mergedContactId: duplicate.id, reparented });
        await writeOutbox(tx, 'contact.merged', tenantId, master.id, { mergedContactId: duplicate.id }, actorId);
        return merged;
      });
    },

    async bulkUpdate(
      tenantId: string,
      ids: string[],
      data: { ownerId?: string; tags?: string[]; action?: 'archive' | 'restore' | 'update'; reason?: string },
      actorId: string
    ): Promise<{ updated: string[]; errors: Array<{ id: string; error: string }> }> {
      const updated: string[] = [];
      const errors: Array<{ id: string; error: string }> = [];
      for (const id of ids) {
        try {
          if (data.action === 'archive') {
            await this.archiveContact(tenantId, id, actorId, data.reason ?? 'Bulk archive');
          } else if (data.action === 'restore') {
            await this.restoreContact(tenantId, id, actorId);
          } else {
            const existing = await loadOrThrow(tenantId, id);
            await this.updateContact(
              tenantId,
              id,
              {
                ...(data.ownerId ? { ownerId: data.ownerId } : {}),
                ...(data.tags ? { tags: Array.from(new Set([...existing.tags, ...data.tags])) } : {}),
              },
              actorId
            );
          }
          updated.push(id);
        } catch (error) {
          errors.push({ id, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
      return { updated, errors };
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;
