import type { CampaignPrisma } from '../prisma.js';

const STATUSES = ['PENDING', 'SENT', 'OPENED', 'CLICKED', 'BOUNCED', 'UNSUBSCRIBED', 'CONVERTED'] as const;

export function createMetricsService(prisma: CampaignPrisma) {
  return {
    async metrics(tenantId: string, campaignId: string) {
      const campaign = await prisma.campaign.findFirst({ where: { tenantId, id: campaignId, deletedAt: null } });
      if (!campaign) return null;

      const grouped = await prisma.campaignMember.groupBy({
        by: ['status'],
        where: { tenantId, campaignId },
        _count: { _all: true },
      });
      const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
      for (const g of grouped) counts[g.status as string] = g._count._all;

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      // "Delivered" = anything that left the door and did not bounce.
      const delivered = counts.SENT + counts.OPENED + counts.CLICKED + counts.CONVERTED + counts.UNSUBSCRIBED;
      const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

      return {
        campaignId,
        status: campaign.status,
        total,
        counts,
        rates: {
          // Opens/clicks are cumulative funnel stages, so a clicker also counts
          // as an opener for rate purposes.
          openRate: rate(counts.OPENED + counts.CLICKED + counts.CONVERTED, delivered),
          clickRate: rate(counts.CLICKED + counts.CONVERTED, delivered),
          bounceRate: rate(counts.BOUNCED, total),
          unsubscribeRate: rate(counts.UNSUBSCRIBED, delivered),
          conversionRate: rate(counts.CONVERTED, delivered),
          deliveryRate: rate(delivered, total),
        },
      };
    },
  };
}
