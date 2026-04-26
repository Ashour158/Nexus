import { faker } from '@faker-js/faker';
import { PrismaClient as CrmPrisma } from '../node_modules/.prisma/crm-client/index.js';
import { PrismaClient as FinancePrisma } from '../node_modules/.prisma/finance-client/index.js';

const TENANT_ID = 'seed-tenant-01';
const OWNER_ID = 'seed-owner-01';

const crm = new CrmPrisma();
const finance = new FinancePrisma();

const accountTypes = ['PROSPECT', 'CUSTOMER', 'PARTNER'] as const;
const leadStatuses = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED'] as const;
const activityTypes = ['EMAIL', 'CALL', 'MEETING', 'NOTE'] as const;
const dealStatuses = ['OPEN', 'WON', 'LOST'] as const;
const productTypes = ['SERVICE', 'PHYSICAL', 'DIGITAL', 'SUBSCRIPTION'] as const;
const quoteStatuses = ['DRAFT', 'SENT', 'ACCEPTED'] as const;
const invoiceStatuses = ['DRAFT', 'SENT', 'PAID', 'OVERDUE'] as const;
const contractStatuses = ['DRAFT', 'ACTIVE', 'EXPIRED'] as const;

async function ensurePipelineAndStages() {
  let pipeline = await crm.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isDefault: true },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) {
    pipeline = await crm.pipeline.create({
      data: {
        tenantId: TENANT_ID,
        name: 'Default Pipeline',
        isDefault: true,
        stages: {
          create: [
            { tenantId: TENANT_ID, name: 'Prospecting', order: 1, probability: 10 },
            { tenantId: TENANT_ID, name: 'Qualified', order: 2, probability: 30 },
            { tenantId: TENANT_ID, name: 'Proposal', order: 3, probability: 60 },
            { tenantId: TENANT_ID, name: 'Negotiation', order: 4, probability: 80 },
            { tenantId: TENANT_ID, name: 'Closed Won', order: 5, probability: 100 },
          ],
        },
      },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }
  return pipeline;
}

async function seedAccounts() {
  const rows = Array.from({ length: 20 }).map(() => ({
    tenantId: TENANT_ID,
    ownerId: OWNER_ID,
    name: faker.company.name(),
    website: faker.internet.url(),
    phone: faker.phone.number(),
    email: faker.internet.email().toLowerCase(),
    industry: faker.commerce.department(),
    type: faker.helpers.arrayElement(accountTypes),
    country: faker.location.country(),
    city: faker.location.city(),
    address: faker.location.streetAddress(),
  }));
  await crm.account.createMany({ data: rows, skipDuplicates: true });
  return crm.account.findMany({ where: { tenantId: TENANT_ID }, take: 20 });
}

async function seedContacts(accounts: Array<{ id: string }>) {
  const rows = accounts.flatMap((account) =>
    Array.from({ length: 2 }).map(() => ({
      tenantId: TENANT_ID,
      ownerId: OWNER_ID,
      accountId: account.id,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      phone: faker.phone.number(),
      jobTitle: faker.person.jobTitle(),
      city: faker.location.city(),
      country: faker.location.country(),
    }))
  );
  await crm.contact.createMany({ data: rows, skipDuplicates: true });
}

async function seedLeads() {
  const rows = Array.from({ length: 15 }).map(() => ({
    tenantId: TENANT_ID,
    ownerId: OWNER_ID,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number(),
    company: faker.company.name(),
    source: 'MANUAL' as const,
    status: faker.helpers.arrayElement(leadStatuses),
    city: faker.location.city(),
    country: faker.location.country(),
  }));
  await crm.lead.createMany({ data: rows, skipDuplicates: true });
  return crm.lead.findMany({ where: { tenantId: TENANT_ID }, take: 15 });
}

async function seedDeals(accounts: Array<{ id: string }>, pipeline: { id: string; stages: Array<{ id: string }> }) {
  const rows = Array.from({ length: 30 }).map(() => {
    const stage = faker.helpers.arrayElement(pipeline.stages);
    return {
      tenantId: TENANT_ID,
      ownerId: OWNER_ID,
      accountId: faker.helpers.arrayElement(accounts).id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      name: `${faker.commerce.productName()} deal`,
      amount: faker.number.int({ min: 5000, max: 250000 }),
      currency: 'USD',
      probability: faker.number.int({ min: 5, max: 95 }),
      expectedCloseDate: faker.date.soon({ days: 120 }),
      status: faker.helpers.arrayElement(dealStatuses),
    };
  });
  await crm.deal.createMany({ data: rows });
  return crm.deal.findMany({ where: { tenantId: TENANT_ID }, take: 30 });
}

async function seedActivities(
  accounts: Array<{ id: string }>,
  contacts: Array<{ id: string }>,
  leads: Array<{ id: string }>,
  deals: Array<{ id: string }>
) {
  const rows = Array.from({ length: 50 }).map(() => ({
    tenantId: TENANT_ID,
    ownerId: OWNER_ID,
    type: faker.helpers.arrayElement(activityTypes),
    subject: faker.lorem.sentence({ min: 3, max: 7 }),
    description: faker.lorem.sentence({ min: 8, max: 15 }),
    status: 'PLANNED' as const,
    priority: faker.helpers.arrayElement(['LOW', 'NORMAL', 'HIGH'] as const),
    dueDate: faker.date.soon({ days: 45 }),
    accountId: faker.helpers.arrayElement(accounts).id,
    contactId: faker.helpers.arrayElement(contacts).id,
    leadId: faker.helpers.arrayElement(leads).id,
    dealId: faker.helpers.arrayElement(deals).id,
  }));
  await crm.activity.createMany({ data: rows });
}

async function seedProducts() {
  const types = [
    'SERVICE', 'SERVICE',
    'PHYSICAL', 'PHYSICAL', 'PHYSICAL',
    'DIGITAL', 'DIGITAL', 'DIGITAL',
    'SUBSCRIPTION', 'SUBSCRIPTION',
  ] as const;
  const rows = types.map((type, idx) => ({
    tenantId: TENANT_ID,
    sku: `SKU-${String(idx + 1).padStart(3, '0')}`,
    name: faker.commerce.productName(),
    description: faker.commerce.productDescription(),
    type,
    currency: 'USD',
    listPrice: faker.number.int({ min: 50, max: 3000 }),
    billingType: type === 'SUBSCRIPTION' ? 'RECURRING' as const : 'ONE_TIME' as const,
  }));
  await finance.product.createMany({ data: rows });
  return finance.product.findMany({ where: { tenantId: TENANT_ID }, take: 10 });
}

async function seedQuotesAndInvoices(
  accounts: Array<{ id: string }>,
  deals: Array<{ id: string }>
) {
  const quotes = await Promise.all(
    Array.from({ length: 10 }).map(async (_, i) => {
      const subtotal = faker.number.int({ min: 2500, max: 75000 });
      return finance.quote.create({
        data: {
          tenantId: TENANT_ID,
          dealId: faker.helpers.arrayElement(deals).id,
          accountId: faker.helpers.arrayElement(accounts).id,
          ownerId: OWNER_ID,
          quoteNumber: `Q-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
          name: `${faker.company.buzzPhrase()} quote`,
          status: faker.helpers.arrayElement(quoteStatuses),
          currency: 'USD',
          subtotal,
          taxAmount: Math.round(subtotal * 0.1),
          discountAmount: 0,
          total: Math.round(subtotal * 1.1),
          lineItems: [],
        },
      });
    })
  );

  await Promise.all(
    quotes.map((quote, i) =>
      finance.invoice.create({
        data: {
          tenantId: TENANT_ID,
          accountId: quote.accountId,
          invoiceNumber: `INV-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
          status: faker.helpers.arrayElement(invoiceStatuses),
          currency: 'USD',
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          discountAmount: quote.discountAmount,
          total: quote.total,
          dueDate: faker.date.soon({ days: 45 }),
          lineItems: [],
        },
      })
    )
  );
}

async function seedContracts(accounts: Array<{ id: string }>) {
  await Promise.all(
    Array.from({ length: 8 }).map((_, i) =>
      finance.contract.create({
        data: {
          tenantId: TENANT_ID,
          accountId: faker.helpers.arrayElement(accounts).id,
          ownerId: OWNER_ID,
          contractNumber: `CTR-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
          name: `${faker.company.catchPhrase()} agreement`,
          status: faker.helpers.arrayElement(contractStatuses),
          startDate: faker.date.recent({ days: 60 }),
          endDate: faker.date.soon({ days: 365 }),
          currency: 'USD',
          totalValue: faker.number.int({ min: 10000, max: 200000 }),
          lineItems: [],
        },
      })
    )
  );
}

async function main() {
  console.log('Seeding NEXUS CRM...');
  const pipeline = await ensurePipelineAndStages();
  const accounts = await seedAccounts();
  await seedContacts(accounts);
  const contacts = await crm.contact.findMany({ where: { tenantId: TENANT_ID }, take: 40 });
  const leads = await seedLeads();
  const deals = await seedDeals(accounts, pipeline);
  await seedActivities(accounts, contacts, leads, deals);
  await seedProducts();
  await seedQuotesAndInvoices(accounts, deals);
  await seedContracts(accounts);
  console.log('Seed complete');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([crm.$disconnect(), finance.$disconnect()]);
  });
