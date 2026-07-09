export function pipelineFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pip_' + Math.random().toString(36).slice(2, 11),
    tenantId: 'ten_test',
    name: 'Sales Pipeline',
    type: 'sales',
    description: 'Default sales pipeline',
    currency: 'USD',
    isDefault: true,
    isActive: true,
    ownedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: [],
    _count: { deals: 0 },
    ...overrides,
  };
}
