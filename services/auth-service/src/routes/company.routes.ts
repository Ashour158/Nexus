import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';

/**
 * Company profile routes (CRM system-control layer).
 *
 * One `Company` row per tenant. Reads guarded by SETTINGS.READ, the upsert by
 * SETTINGS.UPDATE. All queries are auto tenant-scoped by the tenant Prisma
 * extension (prisma.ts), so `tenantId` is injected on create/find/update.
 */
export async function registerCompanyRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const CompanyUpsertSchema = z
    .object({
      name: z.string().min(1).max(200),
      legalName: z.string().max(200).nullish(),
      domain: z.string().max(255).nullish(),
      logoUrl: z.string().url().max(2048).nullish(),
      industry: z.string().max(120).nullish(),
      size: z.string().max(60).nullish(),
      phone: z.string().max(50).nullish(),
      website: z.string().max(2048).nullish(),
      street: z.string().max(255).nullish(),
      city: z.string().max(120).nullish(),
      state: z.string().max(120).nullish(),
      country: z.string().max(120).nullish(),
      postalCode: z.string().max(30).nullish(),
      timezone: z.string().max(60).nullish(),
      currency: z.string().max(10).nullish(),
    })
    .strict();

  await app.register(
    async (r) => {
      // GET /api/v1/company — the tenant's company profile, or null if unset.
      r.get(
        '/company',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const company = await (prisma as any).company.findFirst({
            where: { tenantId: jwt.tenantId },
          });
          return reply.send({ success: true, data: company ?? null });
        }
      );

      // PUT /api/v1/company — upsert the tenant's company profile.
      r.put(
        '/company',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const body = CompanyUpsertSchema.parse(req.body);
          const existing = await (prisma as any).company.findFirst({
            where: { tenantId: jwt.tenantId },
            select: { id: true },
          });

          let company;
          if (existing) {
            company = await (prisma as any).company.update({
              where: { id_tenantId: { id: existing.id, tenantId: jwt.tenantId } },
              data: body,
            });
          } else {
            company = await (prisma as any).company.create({ data: body });
          }

          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: existing ? 'UPDATE' : 'CREATE',
              resource: 'Company',
              resourceId: company.id,
              newValue: body as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });

          return reply.send({ success: true, data: company });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
