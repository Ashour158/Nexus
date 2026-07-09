import { faker } from '@faker-js/faker';

export interface FakeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  roles: string[];
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function createFakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    id: faker.string.uuid(),
    email: faker.internet.email({ firstName, lastName }),
    firstName,
    lastName,
    tenantId: faker.string.uuid(),
    roles: ['USER'],
    avatarUrl: null,
    createdAt: faker.date.past().toISOString(),
    updatedAt: faker.date.recent().toISOString(),
    ...overrides,
  };
}

export function createFakeUsers(count: number, overrides: Partial<FakeUser> = {}): FakeUser[] {
  return Array.from({ length: count }, () => createFakeUser(overrides));
}
