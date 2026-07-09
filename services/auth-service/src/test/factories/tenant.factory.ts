export function tenantFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ten_' + Math.random().toString(36).slice(2, 11),
    slug: 'test-tenant',
    name: 'Test Tenant',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
