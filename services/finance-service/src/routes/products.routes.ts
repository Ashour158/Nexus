import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  CreateProductSchema,
  IdParamSchema,
  ProductListQuerySchema,
  UpdateProductSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createProductsService } from '../services/products.service.js';

export async function registerProductsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  const products = createProductsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/products',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const parsed = ProductListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await products.listProducts(
            jwt.tenantId,
            { type: q.type, isActive: q.isActive, search: q.search },
            { page: q.page, limit: q.limit, sortBy: q.sortBy, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/products',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const parsed = CreateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const product = await products.createProduct(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: product });
        }
      );

      r.get(
        '/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const product = await products.getProductById(jwt.tenantId, id);
          return reply.send({ success: true, data: product });
        }
      );

      r.patch(
        '/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const product = await products.updateProduct(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: product });
        }
      );

      r.delete(
        '/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await products.deleteProduct(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
