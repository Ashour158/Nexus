import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const state: { app?: FastifyInstance } = {};
  const prismaHealth = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const storagePrisma = {
    fileAttachment: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'file_1',
          tenantId: 'tenant_1',
          filename: 'contract.pdf',
          entityType: 'DEAL',
          entityId: 'deal_1',
        },
      ]),
    },
  };
  const minio = {
    bucketExists: vi.fn().mockResolvedValue(true),
    makeBucket: vi.fn().mockResolvedValue(undefined),
    putObject: vi.fn().mockResolvedValue(undefined),
    presignedGetObject: vi.fn().mockResolvedValue('https://files.example/download'),
    removeObject: vi.fn().mockResolvedValue(undefined),
  };

  return {
    state,
    minio,
    prismaHealth,
    storagePrisma,
    ensureBucket: vi.fn().mockResolvedValue(undefined),
    startService: vi.fn(
      async (
        app: FastifyInstance,
        _port: number,
        registerRoutes: (app: FastifyInstance) => Promise<void>
      ) => {
        state.app = app;
        await registerRoutes(app);
      }
    ),
  };
});

vi.mock('@nexus/service-utils/tracing', () => ({
  startTracing: vi.fn(),
}));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    startService: harness.startService,
  };
});

vi.mock('../../../../node_modules/.prisma/storage-client/index.js', () => ({
  PrismaClient: vi.fn(() => harness.prismaHealth),
}));

vi.mock('../prisma.js', () => ({
  createStoragePrisma: vi.fn(() => harness.storagePrisma),
}));

vi.mock('../minio.js', () => ({
  createMinioClient: vi.fn(() => harness.minio),
  ensureBucket: harness.ensureBucket,
}));

vi.mock('../graphql/index.js', () => ({
  registerGraphQL: vi.fn().mockResolvedValue(undefined),
}));

describe('storage-service', () => {
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('STORAGE_DATABASE_URL', 'postgresql://nexus:nexus@localhost:5432/nexus_storage');
    await import('../index.js');
  });

  afterAll(async () => {
    await harness.state.app?.close();
    vi.unstubAllEnvs();
  });

  it('reports healthy when the database check succeeds', async () => {
    const app = harness.state.app;
    expect(app).toBeDefined();

    const response = await app!.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      service: 'storage-service',
    });
    expect(harness.prismaHealth.$queryRaw).toHaveBeenCalled();
    expect(harness.ensureBucket).toHaveBeenCalledWith(harness.minio, 'nexus-files');
  });

  it('lists files for an authenticated tenant', async () => {
    const app = harness.state.app!;
    const token = (app as any).jwt.sign({
      sub: 'user_1',
      tenantId: 'tenant_1',
      permissions: ['*'],
      roles: ['ADMIN'],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/files',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: [{ id: 'file_1', filename: 'contract.pdf' }],
    });
    expect(harness.storagePrisma.fileAttachment.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });
});
