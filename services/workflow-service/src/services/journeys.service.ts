import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';

export function createJourneysService(prisma: WorkflowPrisma) {
  return {
    async listJourneys(tenantId: string, page: number, limit: number) {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        prisma.journey.findMany({
          where: { tenantId },
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
          include: { _count: { select: { enrollments: true } } },
        }),
        prisma.journey.count({ where: { tenantId } }),
      ]);
      return { items, total, page, limit };
    },

    async createJourney(
      tenantId: string,
      data: {
        name: string;
        description?: string;
        entryTrigger: string;
        entryConfig?: Record<string, unknown>;
        nodes: unknown[];
        edges?: unknown[];
        settings?: Record<string, unknown>;
      }
    ) {
      return prisma.journey.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          entryTrigger: data.entryTrigger,
          entryConfig: data.entryConfig ?? {},
          nodes: data.nodes as any,
          edges: (data.edges ?? []) as any,
          settings: data.settings ?? {},
        },
      });
    },

    async updateJourney(
      tenantId: string,
      id: string,
      data: Partial<{
        name: string;
        description: string;
        entryTrigger: string;
        entryConfig: Record<string, unknown>;
        nodes: unknown[];
        edges: unknown[];
        settings: Record<string, unknown>;
        status: string;
      }>
    ) {
      await this.getJourneyOrThrow(tenantId, id);
      return prisma.journey.update({
        where: { id },
        data: {
          ...data,
          nodes: data.nodes as any,
          edges: data.edges as any,
          entryConfig: data.entryConfig as any,
          settings: data.settings as any,
        },
      });
    },

    async getJourneyOrThrow(tenantId: string, id: string) {
      const row = await prisma.journey.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Journey', id);
      return row;
    },

    async deleteJourney(tenantId: string, id: string) {
      await this.getJourneyOrThrow(tenantId, id);
      await prisma.journey.delete({ where: { id } });
    },

    async activateJourney(tenantId: string, id: string) {
      await this.getJourneyOrThrow(tenantId, id);
      return prisma.journey.update({
        where: { id },
        data: { status: 'ACTIVE', updatedAt: new Date() },
      });
    },

    async pauseJourney(tenantId: string, id: string) {
      await this.getJourneyOrThrow(tenantId, id);
      return prisma.journey.update({
        where: { id },
        data: { status: 'PAUSED', updatedAt: new Date() },
      });
    },

    async archiveJourney(tenantId: string, id: string) {
      await this.getJourneyOrThrow(tenantId, id);
      return prisma.journey.update({
        where: { id },
        data: { status: 'ARCHIVED', updatedAt: new Date() },
      });
    },

    async enrollContact(tenantId: string, journeyId: string, contactId: string, metadata?: Record<string, unknown>) {
      return prisma.journeyEnrollment.upsert({
        where: { journeyId_contactId: { journeyId, contactId } },
        create: {
          tenantId,
          journeyId,
          contactId,
          status: 'ACTIVE',
          metadata: metadata ?? {},
        },
        update: {
          status: 'ACTIVE',
          exitedAt: null,
          exitReason: null,
          metadata: metadata ?? {},
        },
      });
    },

    async exitEnrollment(tenantId: string, journeyId: string, contactId: string, reason: string) {
      return prisma.journeyEnrollment.updateMany({
        where: { journeyId, contactId, tenantId },
        data: { status: 'EXITED', exitedAt: new Date(), exitReason: reason },
      });
    },

    async listEnrollments(tenantId: string, journeyId: string, page: number, limit: number) {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        prisma.journeyEnrollment.findMany({
          where: { tenantId, journeyId },
          orderBy: { enteredAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.journeyEnrollment.count({ where: { tenantId, journeyId } }),
      ]);
      return { items, total, page, limit };
    },
  };
}
