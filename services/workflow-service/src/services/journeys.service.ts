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
          entryConfig: (data.entryConfig ?? {}) as any,
          nodes: data.nodes as any,
          edges: (data.edges ?? []) as any,
          settings: (data.settings ?? {}) as any,
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
        } as any,
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
          metadata: (metadata ?? {}) as any,
        },
        update: {
          status: 'ACTIVE',
          exitedAt: null,
          exitReason: null,
          metadata: (metadata ?? {}) as any,
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

    /**
     * PathFinder — the journey definition as a node/edge graph for visual
     * rendering, each node augmented with LIVE enrollment counts (how many active
     * enrollments currently sit on it) plus journey-level status totals. Built
     * from the React-Flow `nodes`/`edges` the journey already stores and the
     * `JourneyEnrollment.currentNodeId` positions we already track.
     */
    async getJourneyGraph(tenantId: string, id: string) {
      const journey = await this.getJourneyOrThrow(tenantId, id);
      const rawNodes = Array.isArray(journey.nodes) ? (journey.nodes as Array<Record<string, unknown>>) : [];
      const rawEdges = Array.isArray(journey.edges) ? (journey.edges as Array<Record<string, unknown>>) : [];

      // Live enrollment counts grouped by the node an ACTIVE enrollment sits on.
      const [byNode, byStatus] = await Promise.all([
        prisma.journeyEnrollment.groupBy({
          by: ['currentNodeId'],
          where: { tenantId, journeyId: id, status: 'ACTIVE' },
          _count: { _all: true },
        }),
        prisma.journeyEnrollment.groupBy({
          by: ['status'],
          where: { tenantId, journeyId: id },
          _count: { _all: true },
        }),
      ]);

      const activeByNode = new Map<string, number>();
      for (const g of byNode) {
        if (g.currentNodeId) activeByNode.set(g.currentNodeId, g._count._all);
      }
      const statusTotals: Record<string, number> = {};
      let total = 0;
      for (const g of byStatus) {
        statusTotals[g.status] = g._count._all;
        total += g._count._all;
      }

      const nodes = rawNodes.map((n) => {
        const nodeId = String(n.id ?? '');
        return { ...n, stats: { activeEnrollments: activeByNode.get(nodeId) ?? 0 } };
      });

      return {
        journeyId: journey.id,
        name: journey.name,
        status: journey.status,
        nodes,
        edges: rawEdges,
        enrollmentTotals: { total, byStatus: statusTotals },
      };
    },
  };
}

// ─── PathFinder: reconstruct a record's actual journey path ──────────────────

/** A single ordered step on a record's reconstructed timeline. */
export interface RecordPathEntry {
  timestamp: string;
  source: 'command_journey' | 'marketing_journey' | 'scheduled_action';
  refId: string; // journeyId or ruleId
  refName: string;
  stage: string | null; // node / step the record is (or was) on
  action: string;
  outcome: string;
}

/**
 * Reconstruct the ORDERED path a specific record took through journeys +
 * automation, from the enrollment history and scheduled-action rows we already
 * store. Aggregates three sources and sorts by timestamp:
 *   - CommandJourney enrollments for (module, recordId)
 *   - marketing Journey enrollments (contact records only)
 *   - ScheduledAutomationAction rows targeting the record (delay + date triggers)
 */
export async function reconstructRecordPath(
  prisma: WorkflowPrisma,
  tenantId: string,
  module: string,
  recordId: string
): Promise<{ module: string; recordId: string; timeline: RecordPathEntry[]; summary: Record<string, number> }> {
  const [commandEnrollments, marketingEnrollments, scheduled] = await Promise.all([
    prisma.commandJourneyEnrollment.findMany({
      where: { tenantId, entityType: module, entityId: recordId },
      include: { journey: { select: { id: true, name: true } } },
      orderBy: { enteredAt: 'asc' },
    }),
    module === 'contact'
      ? prisma.journeyEnrollment.findMany({
          where: { tenantId, contactId: recordId },
          include: { journey: { select: { id: true, name: true } } },
          orderBy: { enteredAt: 'asc' },
        })
      : Promise.resolve([] as never[]),
    prisma.scheduledAutomationAction.findMany({
      where: { tenantId, module, entityId: recordId },
      include: { rule: { select: { id: true, name: true } } },
      orderBy: { runAt: 'asc' },
    }),
  ]);

  const timeline: RecordPathEntry[] = [];

  for (const e of commandEnrollments) {
    timeline.push({
      timestamp: e.enteredAt.toISOString(),
      source: 'command_journey',
      refId: e.journeyId,
      refName: e.journey?.name ?? e.journeyId,
      stage: e.currentStepId ?? null,
      action: 'enrolled',
      outcome: e.status,
    });
    // A terminal enrollment records its exit as a second timeline point.
    if (e.status !== 'ACTIVE') {
      timeline.push({
        timestamp: (e.lastStepAt ?? e.updatedAt).toISOString(),
        source: 'command_journey',
        refId: e.journeyId,
        refName: e.journey?.name ?? e.journeyId,
        stage: e.currentStepId ?? null,
        action: e.status === 'COMPLETED' ? 'completed' : e.status === 'EXITED' ? 'exited' : 'failed',
        outcome: e.error ?? e.status,
      });
    }
  }

  for (const e of marketingEnrollments as Array<{
    journeyId: string;
    journey?: { name: string } | null;
    currentNodeId: string | null;
    enteredAt: Date;
    exitedAt: Date | null;
    exitReason: string | null;
    status: string;
  }>) {
    timeline.push({
      timestamp: e.enteredAt.toISOString(),
      source: 'marketing_journey',
      refId: e.journeyId,
      refName: e.journey?.name ?? e.journeyId,
      stage: e.currentNodeId ?? null,
      action: 'enrolled',
      outcome: e.status,
    });
    if (e.exitedAt) {
      timeline.push({
        timestamp: e.exitedAt.toISOString(),
        source: 'marketing_journey',
        refId: e.journeyId,
        refName: e.journey?.name ?? e.journeyId,
        stage: e.currentNodeId ?? null,
        action: 'exited',
        outcome: e.exitReason ?? e.status,
      });
    }
  }

  for (const s of scheduled) {
    const label = (s.action as { type?: string } | Array<{ type?: string }>) as unknown;
    const actionType = Array.isArray(label)
      ? (label as Array<{ type?: string }>).map((a) => a?.type).filter(Boolean).join(',')
      : (label as { type?: string })?.type ?? 'action';
    timeline.push({
      timestamp: s.createdAt.toISOString(),
      source: 'scheduled_action',
      refId: s.ruleId,
      refName: s.rule?.name ?? s.ruleId,
      stage: `${s.origin}:${actionType}`,
      action: 'scheduled',
      outcome: `runAt=${s.runAt.toISOString()}`,
    });
    if (s.firedAt) {
      timeline.push({
        timestamp: s.firedAt.toISOString(),
        source: 'scheduled_action',
        refId: s.ruleId,
        refName: s.rule?.name ?? s.ruleId,
        stage: `${s.origin}:${actionType}`,
        action: s.status === 'DONE' ? 'fired' : s.status === 'CANCELLED' ? 'cancelled' : 'failed',
        outcome: s.error ?? s.status,
      });
    }
  }

  timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    module,
    recordId,
    timeline,
    summary: {
      commandJourneys: commandEnrollments.length,
      marketingJourneys: marketingEnrollments.length,
      scheduledActions: scheduled.length,
      timelineEntries: timeline.length,
    },
  };
}
