import type { BillingPrisma } from '../prisma.js';

// Subscription statuses that grant plan entitlements. A PAST_DUE tenant keeps
// access during the dunning window; CANCELLED/EXPIRED do not.
const ENTITLING_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const;

/**
 * Resolves the set of feature keys a tenant is entitled to: the union of
 * `plan.features` across the tenant's entitling subscriptions.
 *
 * Runs outside a request context (poller / internal endpoint / guard), so it
 * filters `tenantId` explicitly rather than relying on the tenant Prisma
 * extension. Returns a de-duplicated string array.
 */
export async function resolveTenantEntitlements(
  prisma: BillingPrisma,
  tenantId: string
): Promise<{ features: string[]; plan: string | null; status: string | null }> {
  const subs = await prisma.subscription.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: [...ENTITLING_STATUSES] },
    },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });

  const features = new Set<string>();
  for (const sub of subs) {
    const raw = (sub.plan?.features ?? []) as unknown;
    if (Array.isArray(raw)) {
      for (const f of raw) if (f != null) features.add(String(f));
    }
  }

  return {
    features: [...features],
    plan: subs[0]?.plan?.name ?? null,
    status: subs[0]?.status ?? null,
  };
}

/**
 * Builds an in-process EntitlementResolver bound to billing's Prisma, for use
 * with `setEntitlementResolver` so billing never HTTP-calls itself to gate its
 * own routes.
 */
export function createLocalEntitlementResolver(prisma: BillingPrisma) {
  return async (tenantId: string): Promise<string[]> => {
    const { features } = await resolveTenantEntitlements(prisma, tenantId);
    return features;
  };
}
