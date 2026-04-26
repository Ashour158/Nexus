import { PrismaClient } from '../../../node_modules/.prisma/integration-client/index.js';
import { alsStore } from './request-context.js';

const skipTenantModels = new Set<string>();

function mergeWhere(args: Record<string, unknown>, tenantId: string): Record<string, unknown> {
  const where = (args.where as Record<string, unknown> | undefined) ?? {};
  return { ...args, where: { ...where, tenantId } };
}

function applyTenantArgs(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  switch (operation) {
    case 'create':
      return {
        ...args,
        data: { ...(args.data as Record<string, unknown>), tenantId },
      };
    case 'createMany':
      if (Array.isArray(args.data)) {
        return {
          ...args,
          data: (args.data as Record<string, unknown>[]).map((d) => ({ ...d, tenantId })),
        };
      }
      return args;
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany':
    case 'findMany':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
      return mergeWhere(args, tenantId);
    case 'upsert':
      return {
        ...args,
        where: { ...(args.where as Record<string, unknown>), tenantId },
        create: { ...(args.create as Record<string, unknown>), tenantId },
      };
    default:
      return args;
  }
}

function delegateName(model: string): keyof PrismaClient {
  return (model.charAt(0).toLowerCase() + model.slice(1)) as keyof PrismaClient;
}

export function createIntegrationPrisma() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          if (skipTenantModels.has(model)) {
            return query(args);
          }
          const tenantId = alsStore.get('tenantId') as string | undefined;
          if (!tenantId) {
            return query(args);
          }

          const d = base[delegateName(model)] as {
            findFirst?: (a: unknown) => Promise<unknown>;
            findFirstOrThrow?: (a: unknown) => Promise<unknown>;
          };

          if (operation === 'findUnique' && d.findFirst) {
            return d.findFirst(mergeWhere(args as Record<string, unknown>, tenantId));
          }
          if (operation === 'findUniqueOrThrow' && d.findFirstOrThrow) {
            return d.findFirstOrThrow(mergeWhere(args as Record<string, unknown>, tenantId));
          }

          return query(applyTenantArgs(operation, args as Record<string, unknown>, tenantId));
        },
      },
    },
  });
}

export type IntegrationPrisma = ReturnType<typeof createIntegrationPrisma>;
