import type { CampaignPrisma } from '../prisma.js';
import { NexusProducer, TOPICS } from '@nexus/kafka';

export type MemberEntity = 'LEAD' | 'CONTACT';

export interface MemberInput {
  entityType: MemberEntity;
  entityId: string;
  email: string;
}

export function createMembersService(prisma: CampaignPrisma, producer: NexusProducer) {
  async function assertCampaign(tenantId: string, campaignId: string) {
    return prisma.campaign.findFirst({ where: { tenantId, id: campaignId, deletedAt: null } });
  }

  return {
    async list(tenantId: string, campaignId: string, status: string | undefined, page: number, limit: number) {
      const where = { tenantId, campaignId, ...(status ? { status: status as any } : {}) };
      const [total, items] = await Promise.all([
        prisma.campaignMember.count({ where }),
        prisma.campaignMember.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },

    // Bulk-add members. Deduplicates against the composite unique
    // (tenantId, campaignId, entityType, entityId) via skipDuplicates and
    // returns how many rows were actually inserted.
    async add(tenantId: string, campaignId: string, members: MemberInput[]) {
      const campaign = await assertCampaign(tenantId, campaignId);
      if (!campaign) return { error: 'NOT_FOUND' as const };
      if (members.length === 0) return { added: 0, requested: 0 };
      const result = await prisma.campaignMember.createMany({
        data: members.map((m) => ({
          tenantId,
          campaignId,
          entityType: m.entityType,
          entityId: m.entityId,
          email: m.email,
        })),
        skipDuplicates: true,
      });
      try {
        await producer.publish(TOPICS.ANALYTICS, {
          type: 'campaign.member_added',
          tenantId,
          payload: { campaignId, added: result.count, requested: members.length },
        });
      } catch {
        /* ignore publish errors */
      }
      return { added: result.count, requested: members.length };
    },

    async remove(tenantId: string, campaignId: string, memberId: string) {
      const existing = await prisma.campaignMember.findFirst({ where: { tenantId, id: memberId, campaignId } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      await prisma.campaignMember.delete({ where: { id: memberId } });
      return { deleted: true };
    },
  };
}
