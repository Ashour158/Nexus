import { faker } from '@faker-js/faker';

export interface FakeDeal {
  id: string;
  name: string;
  amount: number;
  stageId: string;
  tenantId: string;
  ownerId?: string;
  accountId?: string;
  probability?: number;
  expectedCloseDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function createFakeDeal(overrides: Partial<FakeDeal> = {}): FakeDeal {
  return {
    id: faker.string.uuid(),
    name: faker.company.name() + ' Deal',
    amount: faker.number.int({ min: 5000, max: 500000 }),
    stageId: faker.string.uuid(),
    tenantId: faker.string.uuid(),
    ownerId: faker.string.uuid(),
    accountId: faker.string.uuid(),
    probability: faker.number.int({ min: 0, max: 100 }),
    expectedCloseDate: faker.date.future().toISOString(),
    createdAt: faker.date.past().toISOString(),
    updatedAt: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function createFakeDeals(count: number, overrides: Partial<FakeDeal> = {}): FakeDeal[] {
  return Array.from({ length: count }, () => createFakeDeal(overrides));
}
