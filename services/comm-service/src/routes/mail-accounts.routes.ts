import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { MailAccountsService } from '../services/mail-accounts.service.js';

const SmtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const OAuthConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

const CreateSchema = z
  .object({
    provider: z.enum(['SMTP', 'GMAIL', 'OUTLOOK']),
    displayName: z.string().min(1),
    fromEmail: z.string().email(),
    fromName: z.string().optional(),
    isDefault: z.boolean().optional(),
    smtp: SmtpConfigSchema.optional(),
    oauth: OAuthConfigSchema.optional(),
  })
  .refine((v) => v.provider !== 'SMTP' || !!v.smtp, {
    message: 'smtp config is required when provider is SMTP',
    path: ['smtp'],
  });

const UpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  fromName: z.string().optional(),
  isActive: z.boolean().optional(),
  smtp: SmtpConfigSchema.optional(),
  oauth: OAuthConfigSchema.optional(),
});

/**
 * Per-user mail-account management (Settings > Mail Accounts). Every route is
 * RBAC-guarded AND owner-scoped: the caller's JWT `sub` is the owner and the
 * service only ever reads/writes rows where userId === sub. Secrets are never
 * returned (responses are masked).
 */
export async function registerMailAccountsRoutes(
  app: FastifyInstance,
  service: MailAccountsService
): Promise<void> {
  await app.register(
    async (r) => {
      // List mine
      r.get(
        '/mail-accounts',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const data = await service.listMine(jwt.tenantId, jwt.sub);
          return reply.send({ success: true, data });
        }
      );

      // Get one (mine)
      r.get(
        '/mail-accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const data = await service.getMine(jwt.tenantId, jwt.sub, id);
          return reply.send({ success: true, data });
        }
      );

      // Register a new account
      r.post(
        '/mail-accounts',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const data = await service.create(jwt.tenantId, jwt.sub, parsed.data);
          return reply.code(201).send({ success: true, data });
        }
      );

      // Update / rotate secrets
      r.patch(
        '/mail-accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = UpdateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const data = await service.update(jwt.tenantId, jwt.sub, id, parsed.data);
          return reply.send({ success: true, data });
        }
      );

      // Delete
      r.delete(
        '/mail-accounts/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const data = await service.remove(jwt.tenantId, jwt.sub, id);
          return reply.send({ success: true, data });
        }
      );

      // Set default
      r.post(
        '/mail-accounts/:id/set-default',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const data = await service.setDefault(jwt.tenantId, jwt.sub, id);
          return reply.send({ success: true, data });
        }
      );

      // Verify (test connection)
      r.post(
        '/mail-accounts/:id/verify',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = request.params as { id: string };
          const data = await service.verify(jwt.tenantId, jwt.sub, id);
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
