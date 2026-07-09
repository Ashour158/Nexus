export function stageFactory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stg_' + Math.random().toString(36).slice(2, 11),
    tenantId: 'ten_test',
    pipelineId: 'pip_test',
    name: 'Prospecting',
    order: 0,
    probability: 10,
    rottenDays: 30,
    requiredFields: {},
    color: '#3b82f6',
    isWon: false,
    isLost: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
