import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  ContractListQuerySchema,
  CreateContractSchema,
  IdParamSchema,
  SignContractSchema,
  UpdateContractSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createContractsService } from '../services/contracts.service.js';

export async function registerContractsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  const contracts = createContractsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/contracts',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.READ) },
        async (request, reply) => {
          const parsed = ContractListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await contracts.listContracts(
            jwt.tenantId,
            { accountId: q.accountId, status: q.status, search: q.search },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/contracts',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateContractSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const contract = await contracts.createContract(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: contract });
        }
      );

      r.get(
        '/contracts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const contract = await contracts.getContractById(jwt.tenantId, id);
          return reply.send({ success: true, data: contract });
        }
      );

      r.patch(
        '/contracts/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.CREATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateContractSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const contract = await contracts.updateContract(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.send({ success: true, data: contract });
        }
      );

      r.post(
        '/contracts/:id/sign',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.SIGN) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = SignContractSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const contract = await contracts.signContract(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.send({ success: true, data: contract });
        }
      );

      r.post(
        '/contracts/:id/terminate',
        { preHandler: requirePermission(PERMISSIONS.CONTRACTS.CREATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const contract = await contracts.terminateContract(jwt.tenantId, id);
          return reply.send({ success: true, data: contract });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
