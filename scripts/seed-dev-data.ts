#!/usr/bin/env tsx
/**
 * Seed development data across all services.
 */
import { PrismaClient as CrmPrisma } from '@prisma/client';

const crm = new CrmPrisma({
  datasources: { db: { url: process.env.CRM_DATABASE_URL } },
});

async function seed(): Promise<void> {
  console.log('=== Seeding development data ===');

  // Seed tenants
  const tenant = await crm.tenant.upsert({
    where: { id: 'dev-tenant-1' },
    update: {},
    create: {
      id: 'dev-tenant-1',
      name: 'Dev Tenant',
      slug: 'dev-tenant',
    },
  });
  console.log(`Tenant: ${tenant.name}`);

  // Seed users
  const user = await crm.user.upsert({
    where: { id: 'dev-user-1' },
    update: {},
    create: {
      id: 'dev-user-1',
      email: 'dev@nexus-crm.io',
      name: 'Dev User',
      tenantId: tenant.id,
    },
  });
  console.log(`User: ${user.name}`);

  // Seed contacts
  for (let i = 1; i <= 10; i++) {
    await crm.contact.upsert({
      where: { id: `dev-contact-${i}` },
      update: {},
      create: {
        id: `dev-contact-${i}`,
        email: `contact${i}@example.com`,
        firstName: `Contact${i}`,
        lastName: 'Test',
        tenantId: tenant.id,
      },
    });
  }
  console.log('10 contacts seeded');

  // Seed deals
  for (let i = 1; i <= 5; i++) {
    await crm.deal.upsert({
      where: { id: `dev-deal-${i}` },
      update: {},
      create: {
        id: `dev-deal-${i}`,
        name: `Deal ${i}`,
        value: 10000 * i,
        status: i % 2 === 0 ? 'WON' : 'OPEN',
        tenantId: tenant.id,
        ownerId: user.id,
      },
    });
  }
  console.log('5 deals seeded');

  await crm.$disconnect();
  console.log('✅ Seeding complete');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
