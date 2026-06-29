import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerProductsRoutes } from './products.routes.js';
import { productFactory } from '../test/factories/product.factory.js';

function createMockPrisma() {
  return {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    priceTier: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? fn() : fn)),
    $disconnect: vi.fn(),
  };
}

function createTestApp(prisma: ReturnType<typeof createMockPrisma>) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    (request as any).user = { tenantId: 'ten_test', sub: 'usr_test', email: 'test@example.com', roles: ['ADMIN'], permissions: ['*'] };
  });
  registerProductsRoutes(app, prisma as any);
  return app;
}

describe('products routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('GET /api/v1/products returns paginated list', async () => {
    const app = createTestApp(prisma);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.data).toEqual([]);
  });

  it('POST /api/v1/products creates product', async () => {
    const app = createTestApp(prisma);
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.product.create.mockResolvedValue(productFactory());

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: {
        sku: 'SKU-TEST',
        name: 'Test Product',
        type: 'PHYSICAL',
        currency: 'USD',
        listPrice: 100,
        taxable: true,
        isActive: true,
        priceTiers: [],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
  });

  it('GET /api/v1/products/:id returns product', async () => {
    const app = createTestApp(prisma);
    prisma.product.findFirst.mockResolvedValue(productFactory());

    const res = await app.inject({ method: 'GET', url: '/api/v1/products/prd_test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
  });
});
