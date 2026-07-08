import type { CampaignPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/campaign-client/index.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

export type CampaignType = 'EMAIL' | 'SOCIAL' | 'EVENT' | 'WEBINAR' | 'PAID' | 'OTHER';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

// Allowed state-machine transitions. A campaign flows
// DRAFT → SCHEDULED → RUNNING → PAUSED/COMPLETED → ARCHIVED, with a few
// pragmatic back-edges (unschedule, resume, complete-from-running).
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['SCHEDULED', 'RUNNING', 'ARCHIVED'],
  SCHEDULED: ['RUNNING', 'PAUSED', 'DRAFT', 'ARCHIVED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'ARCHIVED'],
  PAUSED: ['RUNNING', 'COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

export interface CampaignCreateInput {
  name: string;
  type?: CampaignType;
  subject?: string;
  fromName?: string;
  fromEmail?: string;
  contentHtml?: string;
  templateId?: string;
  scheduledAt?: string;
  budget?: number;
  ownerId: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface CampaignListFilters {
  type?: CampaignType;
  status?: CampaignStatus;
  ownerId?: string;
  search?: string;
  page: number;
  limit: number;
}

export function createCampaignsService(prisma: CampaignPrisma, producer: NexusProducer) {
  async function publish(topic: string, type: string, tenantId: string, payload: unknown) {
    try {
      await producer.publish(topic, { type, tenantId, payload });
    } catch {
      /* never let an event publish failure break the request path */
    }
  }

  return {
    async list(tenantId: string, f: CampaignListFilters) {
      const where: Prisma.CampaignWhereInput = {
        tenantId,
        deletedAt: null,
        ...(f.type ? { type: f.type } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.ownerId ? { ownerId: f.ownerId } : {}),
        ...(f.search
          ? {
              OR: [
                { name: { contains: f.search, mode: 'insensitive' } },
                { subject: { contains: f.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [total, items] = await Promise.all([
        prisma.campaign.count({ where }),
        prisma.campaign.findMany({
          where,
          include: { _count: { select: { members: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
      ]);
      return {
        items: items.map((c) => ({ ...c, memberCount: c._count.members })),
        pagination: { page: f.page, limit: f.limit, total, totalPages: Math.ceil(total / f.limit) },
      };
    },

    async get(tenantId: string, id: string) {
      return prisma.campaign.findFirst({
        where: { tenantId, id, deletedAt: null },
        include: { _count: { select: { members: true } } },
      });
    },

    async create(tenantId: string, input: CampaignCreateInput) {
      const campaign = await prisma.campaign.create({
        data: {
          tenantId,
          name: input.name,
          type: input.type ?? 'EMAIL',
          subject: input.subject ?? null,
          fromName: input.fromName ?? null,
          fromEmail: input.fromEmail ?? null,
          contentHtml: input.contentHtml ?? null,
          templateId: input.templateId ?? null,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          budget: input.budget ?? null,
          ownerId: input.ownerId,
          tags: input.tags ?? [],
          customFields: (input.customFields ?? {}) as Prisma.InputJsonValue,
        },
      });
      await publish(TOPICS.ANALYTICS, 'campaign.created', tenantId, {
        campaignId: campaign.id,
        name: campaign.name,
        type: campaign.type,
        ownerId: campaign.ownerId,
      });
      return campaign;
    },

    async update(tenantId: string, id: string, input: Partial<CampaignCreateInput>) {
      const existing = await prisma.campaign.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return null;
      const data: Prisma.CampaignUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.type !== undefined) data.type = input.type;
      if (input.subject !== undefined) data.subject = input.subject;
      if (input.fromName !== undefined) data.fromName = input.fromName;
      if (input.fromEmail !== undefined) data.fromEmail = input.fromEmail;
      if (input.contentHtml !== undefined) data.contentHtml = input.contentHtml;
      if (input.templateId !== undefined) data.templateId = input.templateId;
      if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (input.budget !== undefined) data.budget = input.budget;
      if (input.ownerId !== undefined) data.ownerId = input.ownerId;
      if (input.tags !== undefined) data.tags = input.tags;
      if (input.customFields !== undefined) data.customFields = input.customFields as Prisma.InputJsonValue;
      const campaign = await prisma.campaign.update({ where: { id }, data });
      await publish(TOPICS.ANALYTICS, 'campaign.updated', tenantId, { campaignId: id });
      return campaign;
    },

    async softDelete(tenantId: string, id: string) {
      const existing = await prisma.campaign.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return null;
      return prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
    },

    async restore(tenantId: string, id: string) {
      const existing = await prisma.campaign.findFirst({ where: { tenantId, id, deletedAt: { not: null } } });
      if (!existing) return null;
      return prisma.campaign.update({ where: { id }, data: { deletedAt: null } });
    },

    async changeStatus(tenantId: string, id: string, target: CampaignStatus) {
      const existing = await prisma.campaign.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      const from = existing.status as CampaignStatus;
      if (from === target) return { campaign: existing };
      if (!TRANSITIONS[from].includes(target)) {
        return { error: 'INVALID_TRANSITION' as const, from, to: target };
      }
      const data: Prisma.CampaignUpdateInput = { status: target };
      if (target === 'RUNNING' && !existing.startedAt) data.startedAt = new Date();
      if (target === 'COMPLETED') data.completedAt = new Date();
      const campaign = await prisma.campaign.update({ where: { id }, data });
      await prisma.campaignEvent.create({
        data: { tenantId, campaignId: id, type: 'status_changed', data: { from, to: target } },
      });
      await publish(TOPICS.ANALYTICS, 'campaign.status_changed', tenantId, { campaignId: id, from, to: target });
      return { campaign };
    },

    // Transition to RUNNING and request delivery for each PENDING member. We
    // publish one `campaign.send.requested` event per member on the EMAILS
    // topic (which comm-service / notification-service already consume) plus a
    // single `campaign.launched` summary — we never call comm-service directly.
    async send(tenantId: string, id: string) {
      const existing = await prisma.campaign.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      const from = existing.status as CampaignStatus;
      if (from !== 'RUNNING' && !TRANSITIONS[from].includes('RUNNING')) {
        return { error: 'INVALID_TRANSITION' as const, from, to: 'RUNNING' as CampaignStatus };
      }
      const members = await prisma.campaignMember.findMany({
        where: { tenantId, campaignId: id, status: 'PENDING' },
        take: 10000,
      });
      const campaign =
        from === 'RUNNING'
          ? existing
          : await prisma.campaign.update({
              where: { id },
              data: { status: 'RUNNING', startedAt: existing.startedAt ?? new Date() },
            });

      for (const m of members) {
        await publish(TOPICS.EMAILS, 'campaign.send.requested', tenantId, {
          campaignId: id,
          memberId: m.id,
          entityType: m.entityType,
          entityId: m.entityId,
          email: m.email,
          subject: existing.subject,
          fromName: existing.fromName,
          fromEmail: existing.fromEmail,
          contentHtml: existing.contentHtml,
          templateId: existing.templateId,
        });
      }
      await publish(TOPICS.ANALYTICS, 'campaign.launched', tenantId, {
        campaignId: id,
        memberCount: members.length,
        memberIds: members.map((m) => m.id),
      });
      await prisma.campaignEvent.create({
        data: { tenantId, campaignId: id, type: 'launched', data: { requested: members.length } },
      });
      return { campaign, requested: members.length };
    },
  };
}
