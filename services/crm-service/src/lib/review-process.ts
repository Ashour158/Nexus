import type { CrmPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';

/**
 * Maker-checker interception for incoming edits.
 *
 * When a {@link ReviewProcessConfig} is ACTIVE for a module and the incoming
 * update touches at least one review-gated field, the ENTIRE change is diverted
 * into a PENDING {@link PendingChange} instead of being written to the real
 * record. The caller (an update route) should then respond 202 with the returned
 * `pendingChangeId` rather than performing the write.
 *
 * FAIL-OPEN / SAFE contract — a review misconfiguration or evaluation error must
 * never block a save, and tenants that have not configured a review process see
 * no behavior change:
 *  - No active config for the module          → returns null (write proceeds normally).
 *  - Config active but no gated field touched  → returns null (write proceeds).
 *  - Any error during lookup/creation          → returns null (write proceeds).
 *
 * @param prisma  tenant-scoped CRM prisma client (auto-injects tenantId)
 * @param input   module + record + full change payload + submitter
 * @returns `{ pendingChangeId }` when the edit was diverted, else `null`.
 */
export async function interceptForReview(
  prisma: CrmPrisma,
  input: {
    tenantId: string;
    module: string;
    recordId: string;
    changes: Record<string, unknown>;
    submittedById: string;
  }
): Promise<{ pendingChangeId: string } | null> {
  const { tenantId, module, recordId, changes, submittedById } = input;
  try {
    // Nothing to review on an empty patch.
    const changeKeys = Object.keys(changes ?? {}).filter((k) => changes[k] !== undefined);
    if (changeKeys.length === 0) return null;

    const config = await prisma.reviewProcessConfig.findFirst({
      where: { tenantId, module, isActive: true },
      select: { fields: true },
    });
    if (!config) return null;

    const gated = new Set(config.fields ?? []);
    if (gated.size === 0) return null;

    const touchesGated = changeKeys.some((k) => gated.has(k));
    if (!touchesGated) return null;

    const pending = await prisma.pendingChange.create({
      data: {
        tenantId,
        module,
        recordId,
        submittedById,
        changes: changes as Prisma.InputJsonValue,
        status: 'PENDING',
      },
      select: { id: true },
    });
    return { pendingChangeId: pending.id };
  } catch (err) {
    // Review evaluation must NEVER block a save. Fail-open + log.
    // eslint-disable-next-line no-console
    console.warn(
      `[review-process] interception failed for ${module}/${recordId}; allowing write (fail-open)`,
      err
    );
    return null;
  }
}
