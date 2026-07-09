export function roleFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rol_' + Math.random().toString(36).slice(2, 11),
    tenantId: 'ten_test',
    name: 'ADMIN',
    description: 'Administrator role',
    permissions: ['*'],
    isSystem: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
