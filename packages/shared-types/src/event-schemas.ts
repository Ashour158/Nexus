import { z } from 'zod';

/* ─── Base event schema ─────────────────────────────────────────────────── */

export const kafkaEventBaseSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().min(1),
  timestamp: z.string().datetime(),
  version: z.number().int().positive(),
  source: z.string().min(1),
  correlationId: z.string().uuid().optional(),
});

/* ─── CRM domain events ─────────────────────────────────────────────────── */

export const leadCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('lead.created'),
  payload: z.object({
    leadId: z.string().min(1),
    ownerId: z.string().min(1),
    email: z.string().email().optional(),
    source: z.string(),
  }),
});

export const leadConvertedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('lead.converted'),
  payload: z.object({
    leadId: z.string().min(1),
    accountId: z.string().min(1),
    contactId: z.string().min(1),
    dealId: z.string().optional(),
    ownerId: z.string().min(1),
  }),
});

export const dealCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('deal.created'),
  payload: z.object({
    dealId: z.string().min(1),
    ownerId: z.string().min(1),
    accountId: z.string().min(1),
    amount: z.number(),
    currency: z.string(),
    pipelineId: z.string().min(1),
    stageId: z.string().min(1),
  }),
});

export const dealStageChangedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('deal.stage_changed'),
  payload: z.object({
    dealId: z.string().min(1),
    previousStageId: z.string().min(1),
    newStageId: z.string().min(1),
    ownerId: z.string().min(1),
    amount: z.number(),
    rottenDays: z.number().int().min(1).optional(),
    stageChangedAt: z.string().datetime().optional(),
  }),
});

export const dealWonEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('deal.won'),
  payload: z.object({
    dealId: z.string().min(1),
    ownerId: z.string().min(1),
    accountId: z.string().min(1),
    amount: z.number(),
    currency: z.string(),
  }),
});

export const dealLostEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('deal.lost'),
  payload: z.object({
    dealId: z.string().min(1),
    ownerId: z.string().min(1),
    reason: z.string(),
    amount: z.number(),
  }),
});

export const contactCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('contact.created'),
  payload: z.object({
    contactId: z.string().min(1),
    email: z.string().email().optional(),
    accountId: z.string().optional(),
  }),
});

export const noteCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('note.created'),
  payload: z.object({
    noteId: z.string().min(1),
    authorId: z.string().min(1),
    resourceType: z.string(),
    resourceId: z.string().min(1),
  }),
});

export const noteUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('note.updated'),
  payload: z.object({
    noteId: z.string().min(1),
    authorId: z.string().min(1),
  }),
});

export const noteDeletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('note.deleted'),
  payload: z.object({
    noteId: z.string().min(1),
    authorId: z.string().min(1),
  }),
});

export const companyCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('company.created'),
  payload: z.object({
    companyId: z.string().min(1),
    name: z.string(),
    ownerId: z.string().min(1),
  }),
});

export const companyUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('company.updated'),
  payload: z.object({
    companyId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const companyDeletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('company.deleted'),
  payload: z.object({
    companyId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const meetingCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('meeting.created'),
  payload: z.object({
    meetingId: z.string().min(1),
    ownerId: z.string().min(1),
    title: z.string(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
  }),
});

export const meetingUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('meeting.updated'),
  payload: z.object({
    meetingId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const meetingDeletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('meeting.deleted'),
  payload: z.object({
    meetingId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const taskCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('task.created'),
  payload: z.object({
    taskId: z.string().min(1),
    ownerId: z.string().min(1),
    title: z.string(),
    dueDate: z.string().datetime().optional(),
  }),
});

export const taskUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('task.updated'),
  payload: z.object({
    taskId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const taskDeletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('task.deleted'),
  payload: z.object({
    taskId: z.string().min(1),
    ownerId: z.string().min(1),
  }),
});

export const activityCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('activity.created'),
  payload: z.object({
    activityId: z.string().min(1),
    type: z.string(),
    ownerId: z.string().min(1),
    dealId: z.string().nullable().optional(),
    contactId: z.string().nullable().optional(),
    leadId: z.string().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
  }),
});

export const activityCompletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('activity.completed'),
  payload: z.object({
    activityId: z.string().min(1),
    type: z.string(),
    ownerId: z.string().min(1),
    dealId: z.string().optional(),
    contactId: z.string().optional(),
    outcome: z.string().optional(),
  }),
});

/* ─── Finance domain events ─────────────────────────────────────────────── */

export const quoteCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('quote.created'),
  payload: z.object({
    quoteId: z.string().min(1),
    dealId: z.string().min(1),
    accountId: z.string().min(1),
    total: z.number(),
    currency: z.string(),
  }),
});

export const quoteSentEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('quote.sent'),
  payload: z.object({
    quoteId: z.string().min(1),
    dealId: z.string().min(1),
    accountId: z.string().min(1),
    total: z.number(),
    recipientEmail: z.string().email().optional(),
  }),
});

export const quoteAcceptedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('quote.accepted'),
  payload: z.object({
    quoteId: z.string().min(1),
    dealId: z.string().min(1),
    total: z.number(),
    currency: z.string(),
  }),
});

export const quoteRejectedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('quote.rejected'),
  payload: z.object({
    quoteId: z.string().min(1),
    dealId: z.string().min(1),
    total: z.number(),
    reason: z.string(),
  }),
});

export const quoteVoidedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('quote.voided'),
  payload: z.object({
    quoteId: z.string().min(1),
    dealId: z.string().min(1),
    reason: z.string(),
  }),
});

export const invoiceCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('invoice.created'),
  payload: z.object({
    invoiceId: z.string().min(1),
    accountId: z.string().min(1),
    total: z.number(),
    dueDate: z.string().datetime(),
  }),
});

export const invoicePaidEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('invoice.paid'),
  payload: z.object({
    invoiceId: z.string().min(1),
    accountId: z.string().min(1),
    amount: z.number(),
  }),
});


/* ─── Commission events ─────────────────────────────────────────────────── */

export const commissionCalculatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('commission.calculated'),
  payload: z.object({
    commissionId: z.string().min(1),
    userId: z.string().min(1),
    dealId: z.string().min(1),
    baseAmount: z.number(),
    finalAmount: z.number(),
    currency: z.string(),
  }),
});

export const commissionApprovedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('commission.approved'),
  payload: z.object({
    commissionId: z.string().min(1),
    userId: z.string().min(1),
    finalAmount: z.number(),
  }),
});

export const commissionClawbackEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('commission.clawback'),
  payload: z.object({
    commissionId: z.string().min(1),
    userId: z.string().min(1),
    originalAmount: z.number(),
    reason: z.string(),
  }),
});

/* ─── Workflow events ───────────────────────────────────────────────────── */

export const workflowBranchStartEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('workflow.branch.start'),
  payload: z.object({
    executionId: z.string().min(1),
    parentExecutionId: z.string().min(1),
    branchNodeId: z.string().min(1),
  }),
});


/* ─── Integration events ────────────────────────────────────────────────── */

export const integrationSyncStartedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('integration.sync.started'),
  payload: z.object({
    jobId: z.string().min(1),
    tenantId: z.string().min(1),
    jobType: z.string(),
  }),
});

export const integrationSyncCompletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('integration.sync.completed'),
  payload: z.object({
    jobId: z.string().min(1),
    tenantId: z.string().min(1),
  }),
});

export const integrationSyncFailedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('integration.sync.failed'),
  payload: z.object({
    jobId: z.string().min(1),
    tenantId: z.string().min(1),
    error: z.string(),
  }),
});

/* ─── Blueprint events ──────────────────────────────────────────────────── */

export const blueprintPlaybookCreatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('blueprint.playbook.created'),
  payload: z.object({
    playbookId: z.string().min(1),
    tenantId: z.string().min(1),
    name: z.string(),
  }),
});

export const blueprintPlaybookUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('blueprint.playbook.updated'),
  payload: z.object({
    playbookId: z.string().min(1),
    tenantId: z.string().min(1),
  }),
});

export const blueprintStageUpsertedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('blueprint.stage.upserted'),
  payload: z.object({
    playbookId: z.string().min(1),
    tenantId: z.string().min(1),
    stageId: z.string().min(1),
  }),
});

/* ─── Forecast events ───────────────────────────────────────────────────── */

export const forecastUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('forecast.updated'),
  payload: z.object({
    forecastId: z.string().min(1),
    tenantId: z.string().min(1),
    period: z.string(),
    category: z.string(),
    previousAmount: z.number(),
    newAmount: z.number(),
    currency: z.string(),
  }),
});

export const forecastCommittedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('forecast.committed'),
  payload: z.object({
    forecastId: z.string().min(1),
    tenantId: z.string().min(1),
    period: z.string(),
    committedBy: z.string().min(1),
    amount: z.number(),
    currency: z.string(),
  }),
});

/* ─── Bulk record events ────────────────────────────────────────────────── */

export const recordsBulkUpdatedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('records.bulk.updated'),
  payload: z.object({
    tenantId: z.string().min(1),
    entityType: z.string(),
    recordIds: z.array(z.string().min(1)),
    updatedFields: z.record(z.unknown()),
    updatedBy: z.string().min(1),
  }),
});

export const recordsBulkDeletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('records.bulk.deleted'),
  payload: z.object({
    tenantId: z.string().min(1),
    entityType: z.string(),
    recordIds: z.array(z.string().min(1)),
    deletedBy: z.string().min(1),
  }),
});

export const recordsBulkTaggedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('records.bulk.tagged'),
  payload: z.object({
    tenantId: z.string().min(1),
    entityType: z.string(),
    recordIds: z.array(z.string().min(1)),
    tags: z.array(z.string()),
    taggedBy: z.string().min(1),
  }),
});

export const recordsBulkReassignedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('records.bulk.reassigned'),
  payload: z.object({
    tenantId: z.string().min(1),
    entityType: z.string(),
    recordIds: z.array(z.string().min(1)),
    previousOwnerId: z.string().min(1),
    newOwnerId: z.string().min(1),
    reassignedBy: z.string().min(1),
  }),
});

/* ─── GDPR / Privacy events ─────────────────────────────────────────────── */

export const gdprErasureRequestedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('gdpr.erasure.requested'),
  payload: z.object({
    requestId: z.string().min(1),
    tenantId: z.string().min(1),
    subjectType: z.enum(['USER', 'CONTACT', 'LEAD']),
    subjectId: z.string().min(1),
    requestedBy: z.string().min(1),
  }),
});

export const gdprErasureCompletedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('gdpr.erasure.completed'),
  payload: z.object({
    requestId: z.string().min(1),
    tenantId: z.string().min(1),
    subjectType: z.enum(['USER', 'CONTACT', 'LEAD']),
    subjectId: z.string().min(1),
    servicesAffected: z.array(z.string()),
  }),
});

export const gdprExportRequestedEventSchema = kafkaEventBaseSchema.extend({
  type: z.literal('gdpr.export.requested'),
  payload: z.object({
    requestId: z.string().min(1),
    tenantId: z.string().min(1),
    subjectType: z.enum(['USER', 'CONTACT', 'LEAD']),
    subjectId: z.string().min(1),
    format: z.enum(['JSON', 'CSV']),
    requestedBy: z.string().min(1),
  }),
});

/* ─── Union validator ───────────────────────────────────────────────────── */

export const nexusKafkaEventSchema = z.discriminatedUnion('type', [
  leadCreatedEventSchema,
  leadConvertedEventSchema,
  dealCreatedEventSchema,
  dealStageChangedEventSchema,
  dealWonEventSchema,
  dealLostEventSchema,
  contactCreatedEventSchema,
  noteCreatedEventSchema,
  noteUpdatedEventSchema,
  noteDeletedEventSchema,
  companyCreatedEventSchema,
  companyUpdatedEventSchema,
  companyDeletedEventSchema,
  meetingCreatedEventSchema,
  meetingUpdatedEventSchema,
  meetingDeletedEventSchema,
  taskCreatedEventSchema,
  taskUpdatedEventSchema,
  taskDeletedEventSchema,
  activityCreatedEventSchema,
  activityCompletedEventSchema,
  quoteCreatedEventSchema,
  quoteSentEventSchema,
  quoteAcceptedEventSchema,
  quoteRejectedEventSchema,
  quoteVoidedEventSchema,
  invoiceCreatedEventSchema,
  invoicePaidEventSchema,
  commissionCalculatedEventSchema,
  commissionApprovedEventSchema,
  commissionClawbackEventSchema,
  workflowBranchStartEventSchema,
  integrationSyncStartedEventSchema,
  integrationSyncCompletedEventSchema,
  integrationSyncFailedEventSchema,
  blueprintPlaybookCreatedEventSchema,
  blueprintPlaybookUpdatedEventSchema,
  blueprintStageUpsertedEventSchema,
  forecastUpdatedEventSchema,
  forecastCommittedEventSchema,
  recordsBulkUpdatedEventSchema,
  recordsBulkDeletedEventSchema,
  recordsBulkTaggedEventSchema,
  recordsBulkReassignedEventSchema,
  gdprErasureRequestedEventSchema,
  gdprErasureCompletedEventSchema,
  gdprExportRequestedEventSchema,
]);

export function validateNexusKafkaEvent(data: unknown) {
  return nexusKafkaEventSchema.safeParse(data);
}
