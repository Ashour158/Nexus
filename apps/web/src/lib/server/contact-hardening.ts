import { createId } from '@/lib/server/dev-preview-data';

type ContactRecord = Record<string, unknown> & {
  id: string;
  ownerId: string;
  code: string;
  accountId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  isActive?: boolean;
};

type PreviewState = {
  contacts: ContactRecord[];
  activities?: Array<Record<string, unknown>>;
  quotes?: Array<Record<string, unknown>>;
  rfqs?: Array<Record<string, unknown>>;
};

const ALLOWED_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  'New relationship': ['Business champion', 'Technical evaluator', 'Executive sponsor', 'Dormant', 'Archived'],
  'Business champion': ['Executive sponsor', 'Technical evaluator', 'Dormant', 'Archived'],
  'Technical evaluator': ['Business champion', 'Executive sponsor', 'Dormant', 'Archived'],
  'Executive sponsor': ['Business champion', 'Dormant', 'Archived'],
  Dormant: ['New relationship', 'Business champion', 'Archived'],
  Archived: ['New relationship', 'Dormant'],
};

const GOVERNED_FIELDS = [
  'accountId',
  'ownerId',
  'firstName',
  'lastName',
  'email',
  'phone',
  'mobile',
  'jobTitle',
  'department',
  'country',
  'city',
  'address',
  'preferredChannel',
  'gdprConsent',
  'doNotEmail',
  'doNotCall',
];

export function hardenContactRecord(contact: ContactRecord): ContactRecord {
  const customFields = getCustomFields(contact);
  const lifecycleStage = stringValue(customFields.lifecycleStage) || 'New relationship';
  const documents = recordArray(customFields.documents);
  const emailThreads = recordArray(customFields.emailThreads);
  const auditTrail = recordArray(customFields.auditTrail);
  const fieldHistory = recordArray(customFields.fieldHistory);
  const outboxEvents = recordArray(customFields.outboxEvents);
  const relationshipScore = calculateRelationshipScore(contact, emailThreads, documents);
  const slaStatus = calculateSlaStatus(contact);
  const archive = typeof customFields.archive === 'object' && customFields.archive ? customFields.archive : null;

  return {
    ...contact,
    isActive: contact.isActive ?? true,
    customFields: {
      ...customFields,
      lifecycleStage,
      relationshipScore,
      slaStatus,
      buyingCommitteeRole: stringValue(customFields.buyingCommitteeRole) || inferBuyingRole(contact),
      influenceLevel: stringValue(customFields.influenceLevel) || inferInfluenceLevel(contact),
      duplicatePolicy: customFields.duplicatePolicy ?? 'email-phone-account-name',
      routingPolicy: customFields.routingPolicy ?? 'account-owner-territory-workload',
      mergePolicy: customFields.mergePolicy ?? 'master-keeps-newest-non-empty-field-values',
      archivePolicy: customFields.archivePolicy ?? 'soft-delete-with-restore-and-audit',
      documents,
      emailThreads,
      auditTrail,
      fieldHistory,
      outboxEvents,
      archive,
    },
  };
}

export function findDuplicateContacts(
  contacts: ContactRecord[],
  candidate: Record<string, unknown>,
  excludeId?: string
) {
  const normalizedEmail = normalizeEmail(candidate.email);
  const normalizedPhone = normalizePhone(candidate.phone ?? candidate.mobile);
  const normalizedName = normalizeName(candidate.firstName, candidate.lastName);
  const accountId = String(candidate.accountId ?? '');

  return contacts.filter((contact) => {
    if (contact.id === excludeId) return false;
    const sameEmail = normalizedEmail && normalizeEmail(contact.email) === normalizedEmail;
    const samePhone = normalizedPhone && normalizePhone(contact.phone ?? contact.mobile) === normalizedPhone;
    const sameAccountName =
      accountId &&
      contact.accountId === accountId &&
      normalizeName(contact.firstName, contact.lastName) === normalizedName;
    return Boolean(sameEmail || samePhone || sameAccountName);
  });
}

export function applyContactGovernedPatch(
  contact: ContactRecord,
  patch: Record<string, unknown>,
  actor: string,
  action = 'Contact updated'
) {
  const now = new Date().toISOString();
  const current = hardenContactRecord(contact);
  const customFields = getCustomFields(current);
  const previousLifecycle = stringValue(customFields.lifecycleStage) || 'New relationship';
  const nextCustomFields =
    typeof patch.customFields === 'object' && patch.customFields ? (patch.customFields as Record<string, unknown>) : {};
  const nextLifecycle = stringValue(patch.lifecycleStage ?? nextCustomFields.lifecycleStage) || previousLifecycle;

  if (nextLifecycle !== previousLifecycle && !isLifecycleTransitionAllowed(previousLifecycle, nextLifecycle)) {
    return {
      ok: false as const,
      error: `Lifecycle transition from ${previousLifecycle} to ${nextLifecycle} is not allowed.`,
    };
  }

  const changedFields = collectFieldChanges(current, patch);
  const fieldHistory = [
    ...changedFields.map((change) => ({
      id: createId('field'),
      field: change.field,
      from: change.from,
      to: change.to,
      actor,
      at: now,
    })),
    ...recordArray(customFields.fieldHistory),
  ];
  const auditTrail = [
    {
      id: createId('audit'),
      action,
      actor,
      at: now,
      metadata: { changedFields: changedFields.map((item) => item.field) },
    },
    ...recordArray(customFields.auditTrail),
  ];
  const outboxEvents = [
    {
      id: createId('outbox'),
      topic: action === 'Contact archived' ? 'contact.archived' : 'contact.updated',
      aggregateType: 'contact',
      aggregateId: contact.id,
      actor,
      status: 'pending',
      createdAt: now,
      payload: { changedFields: changedFields.map((item) => item.field) },
    },
    ...recordArray(customFields.outboxEvents),
  ];

  return {
    ok: true as const,
    contact: hardenContactRecord({
      ...current,
      ...patch,
      customFields: {
        ...customFields,
        ...nextCustomFields,
        lifecycleStage: nextLifecycle,
        fieldHistory,
        auditTrail,
        outboxEvents,
      },
      updatedAt: now,
    } as ContactRecord),
  };
}

export function archiveContact(contact: ContactRecord, actor: string, reason: string) {
  return applyContactGovernedPatch(
    contact,
    {
      isActive: false,
      customFields: {
        archive: {
          status: 'archived',
          reason: reason || 'Archived by user',
          archivedBy: actor,
          archivedAt: new Date().toISOString(),
          retentionUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        },
        lifecycleStage: 'Archived',
      },
    },
    actor,
    'Contact archived'
  );
}

export function restoreContact(contact: ContactRecord, actor: string) {
  return applyContactGovernedPatch(
    contact,
    {
      isActive: true,
      customFields: {
        archive: null,
        lifecycleStage: 'New relationship',
      },
    },
    actor,
    'Contact restored'
  );
}

export function mergeContacts(state: PreviewState, masterId: string, duplicateId: string, actor: string) {
  const masterIndex = state.contacts.findIndex((contact) => contact.id === masterId);
  const duplicateIndex = state.contacts.findIndex((contact) => contact.id === duplicateId);
  if (masterIndex === -1 || duplicateIndex === -1 || masterId === duplicateId) {
    return { ok: false as const, error: 'Merge requires two existing, different contacts.' };
  }

  const master = hardenContactRecord(state.contacts[masterIndex]);
  const duplicate = hardenContactRecord(state.contacts[duplicateIndex]);
  const mergedCustomFields = mergeCustomFields(getCustomFields(master), getCustomFields(duplicate));
  const merged = hardenContactRecord({
    ...duplicate,
    ...master,
    phone: master.phone ?? duplicate.phone ?? null,
    mobile: master.mobile ?? duplicate.mobile ?? null,
    jobTitle: master.jobTitle ?? duplicate.jobTitle ?? null,
    department: master.department ?? duplicate.department ?? null,
    country: master.country ?? duplicate.country ?? null,
    city: master.city ?? duplicate.city ?? null,
    address: master.address ?? duplicate.address ?? null,
    tags: Array.from(new Set([...(master.tags ?? []), ...(duplicate.tags ?? [])])),
    customFields: {
      ...mergedCustomFields,
      auditTrail: [
        {
          id: createId('audit'),
          action: 'Contact merged',
          actor,
          at: new Date().toISOString(),
          metadata: { mergedContactId: duplicate.id },
        },
        ...recordArray(mergedCustomFields.auditTrail),
      ],
      outboxEvents: [
        {
          id: createId('outbox'),
          topic: 'contact.merged',
          aggregateType: 'contact',
          aggregateId: master.id,
          actor,
          status: 'pending',
          createdAt: new Date().toISOString(),
          payload: { mergedContactId: duplicate.id },
        },
        ...recordArray(mergedCustomFields.outboxEvents),
      ],
    },
    updatedAt: new Date().toISOString(),
  } as ContactRecord);

  state.contacts[masterIndex] = merged;
  state.contacts[duplicateIndex] = hardenContactRecord({
    ...duplicate,
    isActive: false,
    customFields: {
      ...getCustomFields(duplicate),
      archive: {
        status: 'merged',
        mergedIntoContactId: master.id,
        archivedBy: actor,
        archivedAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  });

  return { ok: true as const, contact: merged };
}

export function addContactDocument(
  contact: ContactRecord,
  body: Record<string, unknown>,
  actor: string
) {
  const now = new Date().toISOString();
  const customFields = getCustomFields(contact);
  const document = {
    id: createId('doc'),
    name: String(body.name ?? body.fileName ?? 'Contact document'),
    type: String(body.type ?? 'General'),
    mimeType: String(body.mimeType ?? 'application/octet-stream'),
    size: Number(body.size ?? 0),
    version: Number(body.version ?? 1),
    storageKey: String(body.storageKey ?? createId('file')),
    scanStatus: 'clean',
    retentionCategory: String(body.retentionCategory ?? 'customer-record'),
    uploadedBy: actor,
    updatedAt: now,
  };

  return applyContactGovernedPatch(
    contact,
    {
      customFields: {
        documents: [document, ...recordArray(customFields.documents)],
      },
    },
    actor,
    'Document attached'
  );
}

export function getContactTimeline(
  contact: ContactRecord,
  activities: Array<Record<string, unknown>> = [],
  commercialRecords: { quotes?: Array<Record<string, unknown>>; rfqs?: Array<Record<string, unknown>> } = {}
) {
  const customFields = getCustomFields(hardenContactRecord(contact));
  const quotes = commercialRecords.quotes ?? [];
  const rfqs = commercialRecords.rfqs ?? [];
  return [
    ...recordArray(customFields.auditTrail).map((item) => timelineItem('audit', item, item.action ?? 'Audit event', item.at)),
    ...recordArray(customFields.fieldHistory).map((item) =>
      timelineItem('field-history', item, `Field changed: ${String(item.field ?? 'Field')}`, item.at)
    ),
    ...recordArray(customFields.documents).map((item) => timelineItem('document', item, item.name ?? 'Document attached', item.updatedAt)),
    ...recordArray(customFields.emailThreads).map((item) => timelineItem('email', item, item.subject ?? 'Email thread', item.lastMessageAt)),
    ...rfqs
      .filter((rfq) => commercialRecordBelongsToContact(rfq, contact, activities))
      .map((item) => timelineItem('rfq', item, item.name ?? item.rfqNumber ?? 'RFQ linked', item.updatedAt ?? item.createdAt)),
    ...quotes
      .filter((quote) => commercialRecordBelongsToContact(quote, contact, activities))
      .map((item) => timelineItem('quote', item, item.name ?? item.quoteNumber ?? 'Quote linked', item.updatedAt ?? item.createdAt)),
    ...activities
      .filter((activity) => activity.contactId === contact.id)
      .map((item) => timelineItem('activity', item, item.subject ?? 'Activity', item.updatedAt ?? item.createdAt)),
  ].sort((left, right) => String(right.at).localeCompare(String(left.at)));
}

export function detectContactSla(contact: ContactRecord) {
  return calculateSlaStatus(contact);
}

function getCustomFields(contact: ContactRecord) {
  return contact.customFields && typeof contact.customFields === 'object' ? contact.customFields : {};
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
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

function isLifecycleTransitionAllowed(from: string, to: string) {
  return ALLOWED_LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

function collectFieldChanges(contact: ContactRecord, patch: Record<string, unknown>) {
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const field of GOVERNED_FIELDS) {
    if (!(field in patch)) continue;
    if (contact[field] !== patch[field]) changes.push({ field, from: contact[field], to: patch[field] });
  }

  const patchCustomFields =
    typeof patch.customFields === 'object' && patch.customFields ? (patch.customFields as Record<string, unknown>) : {};
  const currentCustomFields = getCustomFields(contact);
  for (const [field, value] of Object.entries(patchCustomFields)) {
    if (currentCustomFields[field] !== value) {
      changes.push({ field: `customFields.${field}`, from: currentCustomFields[field], to: value });
    }
  }
  return changes;
}

function mergeCustomFields(master: Record<string, unknown>, duplicate: Record<string, unknown>) {
  return {
    ...duplicate,
    ...master,
    documents: [...recordArray(master.documents), ...recordArray(duplicate.documents)],
    emailThreads: [...recordArray(master.emailThreads), ...recordArray(duplicate.emailThreads)],
    auditTrail: [...recordArray(master.auditTrail), ...recordArray(duplicate.auditTrail)],
    fieldHistory: [...recordArray(master.fieldHistory), ...recordArray(duplicate.fieldHistory)],
    outboxEvents: [...recordArray(master.outboxEvents), ...recordArray(duplicate.outboxEvents)],
  };
}

function calculateRelationshipScore(
  contact: ContactRecord,
  emailThreads: Array<Record<string, unknown>>,
  documents: Array<Record<string, unknown>>
) {
  let score = 30;
  if (contact.email) score += 10;
  if (contact.phone || contact.mobile) score += 10;
  if (contact.gdprConsent) score += 10;
  if (contact.lastContactedAt) score += 15;
  if (emailThreads.length > 0) score += Math.min(emailThreads.length * 5, 15);
  if (documents.length > 0) score += 5;
  return Math.min(score, 100);
}

function calculateSlaStatus(contact: ContactRecord) {
  if (!contact.lastContactedAt) return 'needs-first-touch';
  const days = Math.floor((Date.now() - new Date(String(contact.lastContactedAt)).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 3) return 'healthy';
  if (days <= 10) return 'watch';
  return 'breached';
}

function inferBuyingRole(contact: ContactRecord) {
  const text = `${String(contact.jobTitle ?? '')} ${String(contact.department ?? '')}`.toLowerCase();
  if (text.includes('chief') || text.includes('vp') || text.includes('head')) return 'Decision maker';
  if (text.includes('procurement') || text.includes('finance')) return 'Economic buyer';
  if (text.includes('technology') || text.includes('engineer')) return 'Technical evaluator';
  return 'Stakeholder';
}

function inferInfluenceLevel(contact: ContactRecord) {
  const role = inferBuyingRole(contact);
  if (role === 'Decision maker' || role === 'Economic buyer') return 'High';
  if (role === 'Technical evaluator') return 'Medium';
  return 'Standard';
}

function timelineItem(type: string, source: Record<string, unknown>, title: unknown, at: unknown) {
  return {
    id: String(source.id ?? createId('timeline')),
    type,
    title: String(title ?? 'Timeline event'),
    at: String(at ?? new Date().toISOString()),
    source,
  };
}

function commercialRecordBelongsToContact(
  record: Record<string, unknown>,
  contact: ContactRecord,
  activities: Array<Record<string, unknown>>
) {
  if (record.contactId === contact.id) return true;
  if (record.accountId === contact.accountId) {
    const dealId = typeof record.dealId === 'string' ? record.dealId : '';
    if (!dealId) return true;
    return activities.some((activity) => activity.dealId === dealId && activity.contactId === contact.id);
  }
  return false;
}
