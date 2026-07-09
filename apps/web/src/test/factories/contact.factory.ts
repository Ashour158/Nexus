import { faker } from '@faker-js/faker';

export interface FakeContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  tenantId: string;
  ownerId?: string;
  accountId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function createFakeContact(overrides: Partial<FakeContact> = {}): FakeContact {
  return {
    id: faker.string.uuid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    title: faker.person.jobTitle(),
    company: faker.company.name(),
    tenantId: faker.string.uuid(),
    ownerId: faker.string.uuid(),
    accountId: faker.string.uuid(),
    createdAt: faker.date.past().toISOString(),
    updatedAt: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function createFakeContacts(count: number, overrides: Partial<FakeContact> = {}): FakeContact[] {
  return Array.from({ length: count }, () => createFakeContact(overrides));
}
