import type { FeatureFlag } from '../../../../node_modules/.prisma/metadata-client/index.js';
import type { MetadataPrisma } from '../prisma.js';

/** Partial patch for a single flag. Only provided fields are written. */
export interface FlagPatch {
  enabled?: boolean;
  description?: string | null;
  rollout?: number;
  tenants?: string[];
  users?: string;
}

/** A full flag row as accepted by the bulk endpoint (key is required). */
export interface FlagInput extends FlagPatch {
  key: string;
}

function normalize(patch: FlagPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.enabled !== undefined) data.enabled = Boolean(patch.enabled);
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.rollout !== undefined) {
    const n = Number(patch.rollout);
    data.rollout = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  if (patch.tenants !== undefined) {
    data.tenants = Array.isArray(patch.tenants)
      ? patch.tenants.filter((t): t is string => typeof t === 'string')
      : [];
  }
  if (patch.users !== undefined) data.users = String(patch.users ?? '');
  return data;
}

export function createFeatureFlagsService(prisma: MetadataPrisma) {
  // Upsert-by-(tenantId,key) implemented as findFirst + create/update to avoid
  // the known compound-unique `upsert` pitfall under the tenant Prisma extension.
  async function upsertOne(
    tenantId: string,
    key: string,
    patch: FlagPatch,
    updatedBy: string
  ): Promise<FeatureFlag> {
    const existing = await prisma.featureFlag.findFirst({ where: { tenantId, key } });
    const data = normalize(patch);
    if (existing) {
      return prisma.featureFlag.update({
        where: { id: existing.id },
        data: { ...data, updatedBy },
      });
    }
    return prisma.featureFlag.create({
      data: { tenantId, key, ...data, updatedBy },
    });
  }

  return {
    async listFlags(tenantId: string): Promise<FeatureFlag[]> {
      return prisma.featureFlag.findMany({
        where: { tenantId },
        orderBy: { key: 'asc' },
      });
    },

    upsertFlag(
      tenantId: string,
      key: string,
      patch: FlagPatch,
      updatedBy: string
    ): Promise<FeatureFlag> {
      return upsertOne(tenantId, key, patch, updatedBy);
    },

    async bulkUpsert(
      tenantId: string,
      flags: FlagInput[],
      updatedBy: string
    ): Promise<FeatureFlag[]> {
      const out: FeatureFlag[] = [];
      // Sequential (not $transaction) so each row's findFirst/create is scoped
      // correctly; the set is small (admin-managed flag list).
      for (const { key, ...patch } of flags) {
        if (!key) continue;
        out.push(await upsertOne(tenantId, key, patch, updatedBy));
      }
      return out;
    },
  };
}

export type FeatureFlagsService = ReturnType<typeof createFeatureFlagsService>;
