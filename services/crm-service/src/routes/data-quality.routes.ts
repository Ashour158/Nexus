import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

const SummaryQuerySchema = z.object({
  entityType: z.enum(['account', 'contact']),
});

// Key fields we report completeness on (mirror data-quality.ts scoring configs).
const ACCOUNT_KEY_FIELDS = ['name', 'industry', 'employeeCount', 'country', 'website', 'annualRevenue', 'phone', 'ownerId'] as const;
const CONTACT_KEY_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'accountId', 'country', 'linkedInUrl'] as const;

/**
 * Registers `GET /api/v1/data-quality/summary?entityType=account|contact`.
 * Aggregates over the tenant: avg quality score, low-quality count (score < 50),
 * total records, per-field completeness (% present) for the key fields, and the
 * count of open (pending) DuplicateGroups. Reuses dataQualityScore + DuplicateGroup.
 */
export async function registerDataQualityRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  app.get(
    '/api/v1/data-quality/summary',
    { preHandler: requirePermission(PERMISSIONS.ACCOUNTS.READ) },
    async (request, reply) => {
      const parsed = SummaryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError('Invalid query', parsed.error.flatten());
      }
      const jwt = request.user as JwtPayload;
      const { entityType } = parsed.data;
      const tenantId = jwt.tenantId;

      if (entityType === 'account') {
        const [totalRecords, agg, lowQualityCount, openDuplicateGroups, counts] = await Promise.all([
          prisma.account.count({ where: { tenantId } }),
          prisma.account.aggregate({ where: { tenantId }, _avg: { dataQualityScore: true } }),
          prisma.account.count({ where: { tenantId, dataQualityScore: { lt: 50 } } }),
          prisma.duplicateGroup.count({ where: { tenantId, entityType: 'account', status: 'pending' } }),
          Promise.all(
            ACCOUNT_KEY_FIELDS.map((field) =>
              prisma.account.count({ where: { tenantId, NOT: { [field]: null } } })
            )
          ),
        ]);
        const fieldCompleteness: Record<string, number> = {};
        ACCOUNT_KEY_FIELDS.forEach((field, i) => {
          fieldCompleteness[field] = totalRecords > 0 ? Math.round((counts[i] / totalRecords) * 100) : 0;
        });
        return reply.send({
          success: true,
          data: {
            entityType,
            avgQualityScore: agg._avg.dataQualityScore != null ? Math.round(agg._avg.dataQualityScore) : 0,
            lowQualityCount,
            totalRecords,
            fieldCompleteness,
            openDuplicateGroups,
          },
        });
      }

      // contact
      const [totalRecords, agg, lowQualityCount, openDuplicateGroups, counts] = await Promise.all([
        prisma.contact.count({ where: { tenantId } }),
        prisma.contact.aggregate({ where: { tenantId }, _avg: { dataQualityScore: true } }),
        prisma.contact.count({ where: { tenantId, dataQualityScore: { lt: 50 } } }),
        prisma.duplicateGroup.count({ where: { tenantId, entityType: 'contact', status: 'pending' } }),
        Promise.all(
          CONTACT_KEY_FIELDS.map((field) =>
            prisma.contact.count({ where: { tenantId, NOT: { [field]: null } } })
          )
        ),
      ]);
      const fieldCompleteness: Record<string, number> = {};
      CONTACT_KEY_FIELDS.forEach((field, i) => {
        fieldCompleteness[field] = totalRecords > 0 ? Math.round((counts[i] / totalRecords) * 100) : 0;
      });
      return reply.send({
        success: true,
        data: {
          entityType,
          avgQualityScore: agg._avg.dataQualityScore != null ? Math.round(agg._avg.dataQualityScore) : 0,
          lowQualityCount,
          totalRecords,
          fieldCompleteness,
          openDuplicateGroups,
        },
      });
    }
  );
}
