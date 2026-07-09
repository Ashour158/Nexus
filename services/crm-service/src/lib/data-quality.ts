import type { CrmPrisma } from '../prisma.js';

export type QualityConfig = { field: string; weight: number; required?: boolean };

const CONTACT_FIELDS: QualityConfig[] = [
  { field: 'firstName', weight: 10, required: true },
  { field: 'lastName', weight: 10, required: true },
  { field: 'email', weight: 20, required: true },
  { field: 'phone', weight: 15 },
  { field: 'jobTitle', weight: 10 },
  { field: 'accountId', weight: 15 },
  { field: 'country', weight: 5 },
  { field: 'linkedInUrl', weight: 10 },
];

const ACCOUNT_FIELDS: QualityConfig[] = [
  { field: 'name', weight: 15, required: true },
  { field: 'industry', weight: 15 },
  { field: 'employeeCount', weight: 10 },
  { field: 'country', weight: 10 },
  { field: 'website', weight: 10 },
  { field: 'annualRevenue', weight: 15 },
  { field: 'phone', weight: 10 },
  { field: 'description', weight: 5 },
  { field: 'ownerId', weight: 10 },
];

const DEAL_FIELDS: QualityConfig[] = [
  { field: 'name', weight: 15, required: true },
  { field: 'amount', weight: 20, required: true },
  { field: 'expectedCloseDate', weight: 15, required: true },
  { field: 'ownerId', weight: 15 },
  { field: 'accountId', weight: 15 },
  { field: 'probability', weight: 10 },
  { field: 'source', weight: 5 },
];

const LEAD_FIELDS: QualityConfig[] = [
  { field: 'firstName', weight: 10, required: true },
  { field: 'lastName', weight: 10, required: true },
  { field: 'email', weight: 20, required: true },
  { field: 'phone', weight: 15 },
  { field: 'company', weight: 15 },
  { field: 'jobTitle', weight: 10 },
  { field: 'industry', weight: 10 },
  { field: 'country', weight: 5 },
  { field: 'ownerId', weight: 5 },
];

function scoreRecord(record: Record<string, unknown>, fields: QualityConfig[]): number {
  let earned = 0;
  const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
  for (const config of fields) {
    const val = record[config.field];
    if (
      val !== null &&
      val !== undefined &&
      val !== '' &&
      !(typeof val === 'number' && val === 0)
    ) {
      earned += config.weight;
    }
  }
  return Math.round((earned / totalWeight) * 100);
}

export async function updateContactDataQuality(prisma: CrmPrisma, contactId: string): Promise<number> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return 0;
  const score = scoreRecord(contact as Record<string, unknown>, CONTACT_FIELDS);
  await prisma.contact.update({
    where: { id: contactId },
    data: { dataQualityScore: score },
  });
  return score;
}

export async function updateAccountDataQuality(prisma: CrmPrisma, accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return 0;
  const score = scoreRecord(account as Record<string, unknown>, ACCOUNT_FIELDS);
  await prisma.account.update({
    where: { id: accountId },
    data: { dataQualityScore: score },
  });
  return score;
}

export async function updateDealDataQuality(prisma: CrmPrisma, dealId: string): Promise<number> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) return 0;
  const score = scoreRecord(deal as Record<string, unknown>, DEAL_FIELDS);
  await prisma.deal.update({
    where: { id: dealId },
    data: { dataQualityScore: score },
  });
  return score;
}

export async function updateLeadDataQuality(prisma: CrmPrisma, leadId: string): Promise<number> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return 0;
  const score = scoreRecord(lead as Record<string, unknown>, LEAD_FIELDS);
  await prisma.lead.update({
    where: { id: leadId },
    data: { dataQualityScore: score },
  });
  return score;
}
