/**
 * CommandCenter journey CRUD + enrollment service.
 *
 * Additive alongside the marketing `journeys.service.ts` — this drives the
 * long-running, step-based CommandJourney / CommandJourneyEnrollment models.
 */
import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { parseSteps } from '../engine/journey-steps.js';

const ENTITY_TYPES = ['lead', 'contact', 'account', 'deal'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const JOURNEY_TOPIC = 'nexus.automation.workflows';

export interface CreateCommandJourneyInput {
  name: string;
  description?: string;
  entityType: EntityType;
  entryTrigger?: Record<string, unknown>;
  steps?: unknown[];
  exitCriteria?: Record<string, unknown> | null;
}

export type UpdateCommandJourneyInput = Partial<
  CreateCommandJourneyInput & { status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' }
>;

export function createCommandJourneysService(prisma: WorkflowPrisma, producer: NexusProducer) {
  async function getJourneyOrThrow(tenantId: string, id: string) {
    const row = await prisma.commandJourney.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('CommandJourney', id);
    return row;
  }

  return {
    getJourneyOrThrow,

    async listJourneys(tenantId: string, page: number, limit: number) {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        prisma.commandJourney.findMany({
          where: { tenantId },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
          include: { _count: { select: { enrollments: true } } },
        }),
        prisma.commandJourney.count({ where: { tenantId } }),
      ]);
      return { items, total, page, limit };
    },

    async createJourney(tenantId: string, data: CreateCommandJourneyInput) {
      if (!ENTITY_TYPES.includes(data.entityType)) {
        throw new ValidationError(`entityType must be one of ${ENTITY_TYPES.join(', ')}`);
      }
      return prisma.commandJourney.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          entityType: data.entityType,
          entryTrigger: (data.entryTrigger ?? {}) as object,
          steps: (parseSteps(data.steps) ?? []) as object,
          exitCriteria: (data.exitCriteria ?? undefined) as object | undefined,
        },
      });
    },

    async updateJourney(tenantId: string, id: string, data: UpdateCommandJourneyInput) {
      await getJourneyOrThrow(tenantId, id);
      if (data.entityType && !ENTITY_TYPES.includes(data.entityType)) {
        throw new ValidationError(`entityType must be one of ${ENTITY_TYPES.join(', ')}`);
      }
      return prisma.commandJourney.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          entityType: data.entityType,
          status: data.status,
          entryTrigger: data.entryTrigger as object | undefined,
          steps: data.steps !== undefined ? (parseSteps(data.steps) as object) : undefined,
          exitCriteria: data.exitCriteria as object | undefined,
        },
      });
    },

    async activateJourney(tenantId: string, id: string) {
      await getJourneyOrThrow(tenantId, id);
      return prisma.commandJourney.update({ where: { id }, data: { status: 'ACTIVE' } });
    },

    async archiveJourney(tenantId: string, id: string) {
      await getJourneyOrThrow(tenantId, id);
      return prisma.commandJourney.update({ where: { id }, data: { status: 'ARCHIVED' } });
    },

    async deleteJourney(tenantId: string, id: string) {
      await getJourneyOrThrow(tenantId, id);
      await prisma.commandJourney.delete({ where: { id } });
    },

    /**
     * Enroll a record into a journey. Idempotent on (tenantId, journeyId,
     * entityId): re-enrolling a record that already has an ACTIVE/terminal
     * enrollment returns the existing row (upsert). New enrollments start at the
     * first step with resumeAt=now so the scheduler advances them next tick.
     */
    async enroll(
      tenantId: string,
      journeyId: string,
      entityType: string,
      entityId: string,
      context?: Record<string, unknown>
    ) {
      const journey = await getJourneyOrThrow(tenantId, journeyId);
      const firstStepId = parseSteps(journey.steps)[0]?.id ?? null;

      const enrollment = await prisma.commandJourneyEnrollment.upsert({
        where: {
          tenantId_journeyId_entityId: { tenantId, journeyId, entityId },
        },
        create: {
          tenantId,
          journeyId,
          entityType: entityType || journey.entityType,
          entityId,
          currentStepId: firstStepId,
          status: 'ACTIVE',
          context: (context ?? { entityType: entityType || journey.entityType, entityId }) as object,
          resumeAt: new Date(),
        },
        update: {}, // never clobber an existing enrollment
      });

      // Emit only on genuinely new enrollments (createdAt within the last moment
      // is unreliable; instead emit unconditionally — consumers are idempotent).
      await producer
        .publish(JOURNEY_TOPIC, {
          type: 'journey.enrolled',
          tenantId,
          payload: { journeyId, enrollmentId: enrollment.id, entityType, entityId },
        })
        .catch(() => undefined);

      return enrollment;
    },

    async listEnrollments(tenantId: string, journeyId: string, page: number, limit: number) {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        prisma.commandJourneyEnrollment.findMany({
          where: { tenantId, journeyId },
          orderBy: { enteredAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.commandJourneyEnrollment.count({ where: { tenantId, journeyId } }),
      ]);
      return { items, total, page, limit };
    },

    async exitEnrollment(tenantId: string, journeyId: string, entityId: string, reason: string) {
      return prisma.commandJourneyEnrollment.updateMany({
        where: { tenantId, journeyId, entityId, status: 'ACTIVE' },
        data: { status: 'EXITED', currentStepId: null, resumeAt: null, error: reason },
      });
    },
  };
}

export type CommandJourneysService = ReturnType<typeof createCommandJourneysService>;
export { ENTITY_TYPES };
