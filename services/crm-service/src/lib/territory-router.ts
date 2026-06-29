/**
 * Synchronous territory-based lead router using CRM-native Territory/SalesRep
 * models.  Called inline during lead creation so the user immediately sees the
 * assigned owner.
 */

import type { CrmPrisma } from '../prisma.js';
import type { Lead, Territory, SalesRep } from '../../../../node_modules/.prisma/crm-client/index.js';

interface TerritoryWithReps extends Territory {
  salesReps: SalesRep[];
}

function territoryMatches(territory: TerritoryWithReps, lead: Lead): boolean {
  // Geographic criteria (all empty = no restriction)
  if (territory.countries.length > 0) {
    if (!lead.country || !territory.countries.map(c => c.toLowerCase()).includes(lead.country.toLowerCase())) {
      return false;
    }
  }
  if (territory.cities.length > 0) {
    if (!lead.city || !territory.cities.map(c => c.toLowerCase()).includes(lead.city.toLowerCase())) {
      return false;
    }
  }

  // Company criteria
  if (territory.industries.length > 0) {
    if (!lead.industry || !territory.industries.map(i => i.toLowerCase()).includes(lead.industry.toLowerCase())) {
      return false;
    }
  }
  if (territory.minCompanySize != null) {
    if (lead.employeeCount == null || lead.employeeCount < territory.minCompanySize) {
      return false;
    }
  }
  if (territory.maxCompanySize != null) {
    if (lead.employeeCount == null || lead.employeeCount > territory.maxCompanySize) {
      return false;
    }
  }
  if (territory.minRevenue != null) {
    if (lead.annualRevenue == null || Number(lead.annualRevenue) < Number(territory.minRevenue)) {
      return false;
    }
  }
  if (territory.maxRevenue != null) {
    if (lead.annualRevenue == null || Number(lead.annualRevenue) > Number(territory.maxRevenue)) {
      return false;
    }
  }

  return true;
}

async function pickSalesRep(
  prisma: CrmPrisma,
  territory: TerritoryWithReps
): Promise<SalesRep | null> {
  const activeReps = territory.salesReps.filter(r => r.isActive && r.activeLeads < r.capacity);
  if (activeReps.length === 0) return null;

  if (territory.assignmentMode === 'auto') {
    // First available rep with most remaining capacity
    return activeReps.sort((a, b) => (b.capacity - b.activeLeads) - (a.capacity - a.activeLeads))[0];
  }

  if (territory.assignmentMode === 'round_robin') {
    // Find last assigned rep for this territory via routing events
    const lastEvent = await prisma.leadRoutingEvent.findFirst({
      where: { territoryId: territory.id },
      orderBy: { createdAt: 'desc' },
    });

    let startIndex = 0;
    if (lastEvent) {
      const idx = activeReps.findIndex(r => r.id === lastEvent.salesRepId);
      if (idx >= 0) startIndex = (idx + 1) % activeReps.length;
    }

    for (let i = 0; i < activeReps.length; i++) {
      const rep = activeReps[(startIndex + i) % activeReps.length];
      return rep; // first valid rep in round-robin order
    }
  }

  return null;
}

export interface TerritoryAssignmentResult {
  territoryId: string;
  salesRepId: string;
  userId: string;
  reason: string;
}

/**
 * Attempts to assign a lead to the best-matching active territory.
 * Returns the assignment details or `null` if no territory matched.
 */
export async function assignLeadToTerritory(
  prisma: CrmPrisma,
  tenantId: string,
  lead: Lead
): Promise<TerritoryAssignmentResult | null> {
  const territories = await prisma.territory.findMany({
    where: { tenantId, isActive: true },
    include: { salesReps: { where: { isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const territory of territories) {
    if (!territoryMatches(territory, lead)) continue;
    if (territory.assignmentMode === 'manual') continue;

    const rep = await pickSalesRep(prisma, territory);
    if (!rep) continue;

    // Create routing event for audit trail
    await prisma.leadRoutingEvent.create({
      data: {
        tenantId,
        leadId: lead.id,
        territoryId: territory.id,
        salesRepId: rep.id,
        priority: lead.priority ?? 'medium',
        reason: `Auto-assigned via territory "${territory.name}" (${territory.assignmentMode})`,
        confidence: 1.0,
      },
    });

    // Update sales rep metrics
    await prisma.salesRep.update({
      where: { id: rep.id },
      data: {
        totalLeads: { increment: 1 },
        activeLeads: { increment: 1 },
      },
    });

    return {
      territoryId: territory.id,
      salesRepId: rep.id,
      userId: rep.userId,
      reason: `Auto-assigned via territory "${territory.name}"`,
    };
  }

  return null;
}
