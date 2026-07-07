import { NexusProducer, TOPICS } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { DealTeam } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SplitType = 'revenue' | 'overlay';

export interface CreateDealTeamInput {
  userId: string;
  role: string;
  splitPercent?: number;
  splitType?: SplitType;
}

export interface UpdateDealTeamInput {
  role?: string;
  splitPercent?: number;
  splitType?: SplitType;
}

export interface DealTeamMemberResult {
  member: DealTeam;
  /** True when revenue splits across the deal exceed 100% after this write. */
  revenueSplitOverAllocated: boolean;
  /** Total revenue split % across the deal after this write. */
  revenueSplitTotal: number;
}

// ─── Service Factory ────────────────────────────────────────────────────────

/**
 * Deal splits / deal teams service. Feeds the incentive-service commission
 * engine. Revenue splits should sum to ≤ 100% per deal — over-allocation is
 * surfaced as a warning flag (never a hard failure), matching Salesforce/
 * Dynamics behaviour. Overlay credits are additive and uncapped.
 *
 * Emits `deal.team.updated` on every write so incentive-service can re-credit
 * splits without changing the existing `deal.won` payload.
 */
export function createDealTeamService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadDealOrThrow(tenantId: string, dealId: string) {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId } });
    if (!deal) throw new NotFoundError('Deal', dealId);
    return deal;
  }

  async function loadMemberOrThrow(tenantId: string, id: string): Promise<DealTeam> {
    const row = await prisma.dealTeam.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('DealTeam', id);
    return row;
  }

  async function revenueSplitTotalFor(tenantId: string, dealId: string): Promise<number> {
    const agg = await prisma.dealTeam.aggregate({
      where: { tenantId, dealId, splitType: 'revenue' },
      _sum: { splitPercent: true },
    });
    const total = agg._sum.splitPercent ?? new Prisma.Decimal(0);
    return Number(total.toFixed(2));
  }

  async function emitTeamUpdated(tenantId: string, dealId: string): Promise<void> {
    const rows = await prisma.dealTeam.findMany({
      where: { tenantId, dealId },
      orderBy: { createdAt: 'asc' },
    });
    await producer.publish(TOPICS.DEALS, {
      type: 'deal.team.updated',
      tenantId,
      payload: {
        dealId,
        team: rows.map((r) => ({
          userId: r.userId,
          role: r.role,
          splitType: r.splitType,
          splitPercent: Number(r.splitPercent.toFixed(2)),
        })),
      },
    });
  }

  return {
    async listByDeal(tenantId: string, dealId: string): Promise<DealTeam[]> {
      await loadDealOrThrow(tenantId, dealId);
      return prisma.dealTeam.findMany({
        where: { tenantId, dealId },
        orderBy: { createdAt: 'asc' },
      });
    },

    async create(
      tenantId: string,
      dealId: string,
      input: CreateDealTeamInput
    ): Promise<DealTeamMemberResult> {
      await loadDealOrThrow(tenantId, dealId);
      const member = await prisma.dealTeam.create({
        data: {
          tenantId,
          dealId,
          userId: input.userId,
          role: input.role,
          splitPercent: new Prisma.Decimal(input.splitPercent ?? 0),
          splitType: input.splitType ?? 'revenue',
        },
      });
      const revenueSplitTotal = await revenueSplitTotalFor(tenantId, dealId);
      await emitTeamUpdated(tenantId, dealId);
      return {
        member,
        revenueSplitTotal,
        revenueSplitOverAllocated: revenueSplitTotal > 100,
      };
    },

    async update(
      tenantId: string,
      id: string,
      input: UpdateDealTeamInput
    ): Promise<DealTeamMemberResult> {
      const existing = await loadMemberOrThrow(tenantId, id);
      const data: Prisma.DealTeamUpdateInput = {};
      if (input.role !== undefined) data.role = input.role;
      if (input.splitPercent !== undefined) {
        data.splitPercent = new Prisma.Decimal(input.splitPercent);
      }
      if (input.splitType !== undefined) data.splitType = input.splitType;

      const member = await prisma.dealTeam.update({ where: { id }, data });
      const revenueSplitTotal = await revenueSplitTotalFor(tenantId, existing.dealId);
      await emitTeamUpdated(tenantId, existing.dealId);
      return {
        member,
        revenueSplitTotal,
        revenueSplitOverAllocated: revenueSplitTotal > 100,
      };
    },

    async remove(tenantId: string, id: string): Promise<{ id: string; dealId: string }> {
      const existing = await loadMemberOrThrow(tenantId, id);
      await prisma.dealTeam.delete({ where: { id } });
      await emitTeamUpdated(tenantId, existing.dealId);
      return { id, dealId: existing.dealId };
    },
  };
}
