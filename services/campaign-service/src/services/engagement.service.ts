import type { CampaignPrisma } from '../prisma.js';

type MemberStatus = 'PENDING' | 'SENT' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'UNSUBSCRIBED' | 'CONVERTED';

// Monotonic engagement funnel: a member never moves "backwards" (an OPENED
// member that later bounces stays at its furthest stage). Used to avoid
// clobbering a richer status with a lesser one when events arrive out of order.
const RANK: Record<MemberStatus, number> = {
  PENDING: 0,
  SENT: 1,
  BOUNCED: 2,
  UNSUBSCRIBED: 3,
  OPENED: 4,
  CLICKED: 5,
  CONVERTED: 6,
};

interface EngagementEvent {
  tenantId: string;
  payload: unknown;
}

export function createEngagementService(prisma: CampaignPrisma) {
  // Resolve the CampaignMember(s) an inbound email event refers to. Prefers an
  // explicit memberId (echoed from our own send.requested), then
  // campaignId+email, then email across running campaigns.
  async function resolveMembers(tenantId: string, p: Record<string, unknown>) {
    const memberId = (p.memberId ?? p.campaignMemberId) as string | undefined;
    if (memberId) {
      const m = await prisma.campaignMember.findFirst({ where: { tenantId, id: memberId } });
      return m ? [m] : [];
    }
    const email = (p.email ?? p.to ?? p.recipient) as string | undefined;
    const campaignId = p.campaignId as string | undefined;
    if (email && campaignId) {
      return prisma.campaignMember.findMany({ where: { tenantId, campaignId, email }, take: 500 });
    }
    if (email) {
      return prisma.campaignMember.findMany({
        where: { tenantId, email, campaign: { status: 'RUNNING' } },
        take: 500,
      });
    }
    return [];
  }

  async function applyStatus(
    tenantId: string,
    memberId: string,
    campaignId: string,
    next: MemberStatus,
    stampField: string | null,
    eventType: string,
    raw: Record<string, unknown>
  ) {
    const member = await prisma.campaignMember.findFirst({ where: { tenantId, id: memberId } });
    if (!member) return;
    const data: Record<string, unknown> = {};
    if (RANK[next] > RANK[member.status as MemberStatus]) data.status = next;
    if (stampField) data[stampField] = new Date();
    if (Object.keys(data).length > 0) {
      await prisma.campaignMember.update({ where: { id: memberId }, data });
    }
    await prisma.campaignEvent.create({
      data: { tenantId, campaignId, memberId, type: eventType, data: raw as any },
    });
  }

  const EMAIL_MAP: Record<string, { status: MemberStatus; stamp: string | null }> = {
    'email.sent': { status: 'SENT', stamp: 'sentAt' },
    'email.opened': { status: 'OPENED', stamp: 'openedAt' },
    'email.clicked': { status: 'CLICKED', stamp: 'clickedAt' },
    'email.bounced': { status: 'BOUNCED', stamp: 'bouncedAt' },
    'email.unsubscribed': { status: 'UNSUBSCRIBED', stamp: 'unsubscribedAt' },
  };

  return {
    // Handle an inbound email engagement event (email.sent/opened/clicked/
    // bounced/unsubscribed). Fully guarded so a bad event never crashes the
    // consumer loop.
    async handleEmailEvent(eventType: string, event: EngagementEvent) {
      try {
        const map = EMAIL_MAP[eventType];
        if (!map || !event.tenantId) return;
        const p = (event.payload ?? {}) as Record<string, unknown>;
        const members = await resolveMembers(event.tenantId, p);
        for (const m of members) {
          await applyStatus(event.tenantId, m.id, m.campaignId, map.status, map.stamp, eventType, p);
        }
      } catch {
        /* swallow — engagement is best-effort */
      }
    },

    // Attribution: when a deal is created/won, if its contact/lead is a member
    // of any campaign, stamp convertedDealId + CONVERTED.
    async handleDealEvent(eventType: string, event: EngagementEvent) {
      try {
        if (!event.tenantId) return;
        const p = (event.payload ?? {}) as Record<string, unknown>;
        const dealId = (p.dealId ?? p.id) as string | undefined;
        const entityIds = [p.contactId, p.primaryContactId, p.leadId, p.entityId].filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        );
        if (entityIds.length === 0) return;
        const members = await prisma.campaignMember.findMany({
          where: { tenantId: event.tenantId, entityId: { in: entityIds } },
          take: 1000,
        });
        for (const m of members) {
          if (m.status === 'CONVERTED') continue;
          await prisma.campaignMember.update({
            where: { id: m.id },
            data: { status: 'CONVERTED', convertedAt: new Date(), convertedDealId: dealId ?? null },
          });
          await prisma.campaignEvent.create({
            data: {
              tenantId: event.tenantId,
              campaignId: m.campaignId,
              memberId: m.id,
              type: 'converted',
              data: { dealId, eventType },
            },
          });
        }
      } catch {
        /* swallow — attribution is best-effort */
      }
    },
  };
}
