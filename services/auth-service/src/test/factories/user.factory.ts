export function userFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'usr_' + Math.random().toString(36).slice(2, 11),
    tenantId: 'ten_test',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    keycloakId: 'kc_' + Math.random().toString(36).slice(2, 11),
    isActive: true,
    emailVerified: true,
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
