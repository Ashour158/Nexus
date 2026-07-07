import type { CrmPrisma } from '../prisma.js';
import { createHttpClient } from '@nexus/service-utils';
import { NexusProducer, TOPICS } from '@nexus/kafka';

interface EnrichmentResult {
  company?: string;
  industry?: string;
  employees?: number;
  revenue?: number;
  linkedin?: string;
  website?: string;
  phone?: string;
  city?: string;
  country?: string;
  description?: string;
  confidence: number;
}

export async function enrichContact(
  prisma: CrmPrisma,
  tenantId: string,
  contactId: string,
  producer?: NexusProducer
): Promise<void> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: {
      id: true,
      email: true,
      accountId: true,
      ownerId: true,
      linkedInUrl: true,
      phone: true,
      city: true,
      country: true,
    },
  });
  if (!contact) return;

  const account = contact.accountId
    ? await prisma.account.findFirst({
        where: { id: contact.accountId, tenantId },
        select: { name: true },
      })
    : null;

  const job = await prisma.enrichmentJob.create({
    data: {
      tenantId,
      entityType: 'CONTACT',
      entityId: contactId,
      status: 'PROCESSING',
    },
  });

  try {
    const result = await callEnrichmentProvider('contact', {
      email: contact.email || undefined,
      company: account?.name || undefined,
    });

    if (!result) {
      await prisma.enrichmentJob.update({
        where: { id: job.id },
        data: { status: 'SKIPPED', errorMessage: 'No data found' },
      });
      return;
    }

    const updates: Record<string, unknown> = {};
    const applied: Record<string, unknown> = {};
    if (result.linkedin && !contact.linkedInUrl) {
      updates.linkedInUrl = result.linkedin;
      applied.linkedInUrl = result.linkedin;
    }
    if (result.phone && !contact.phone) {
      updates.phone = result.phone;
      applied.phone = result.phone;
    }
    if (result.city && !contact.city) {
      updates.city = result.city;
      applied.city = result.city;
    }
    if (result.country && !contact.country) {
      updates.country = result.country;
      applied.country = result.country;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.contact.update({ where: { id: contactId }, data: updates });
      // Nervous system: enrichment filled fields → let search/analytics/timeline learn.
      if (producer) {
        await producer
          .publish(TOPICS.CONTACTS, {
            type: 'contact.updated',
            tenantId,
            payload: {
              contactId,
              accountId: contact.accountId ?? undefined,
              changedFields: Object.keys(updates),
            },
          })
          .catch(() => undefined);
      }
    }

    await prisma.enrichmentJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        confidence: result.confidence,
        appliedFields: applied,
        rawData: result as object,
      },
    });
  } catch (err: unknown) {
    await prisma.enrichmentJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
  }
}

export async function enrichAccount(
  prisma: CrmPrisma,
  tenantId: string,
  accountId: string,
  producer?: NexusProducer
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenantId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      website: true,
      industry: true,
      employeeCount: true,
      description: true,
    },
  });
  if (!account) return;

  const job = await prisma.enrichmentJob.create({
    data: { tenantId, entityType: 'ACCOUNT', entityId: accountId, status: 'PROCESSING' },
  });

  try {
    const result = await callEnrichmentProvider('account', {
      name: account.name,
      website: account.website || undefined,
    });
    if (!result) {
      await prisma.enrichmentJob.update({
        where: { id: job.id },
        data: { status: 'SKIPPED' },
      });
      return;
    }

    const updates: Record<string, unknown> = {};
    const applied: Record<string, unknown> = {};

    if (!account.industry && result.industry) {
      updates.industry = result.industry;
      applied.industry = result.industry;
    }
    if (!account.employeeCount && result.employees) {
      updates.employeeCount = result.employees;
      applied.employeeCount = result.employees;
    }
    if (!account.website && result.website) {
      updates.website = result.website;
      applied.website = result.website;
    }
    if (result.description && !account.description) {
      updates.description = result.description;
      applied.description = result.description;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.account.update({ where: { id: accountId }, data: updates });
      // Nervous system: enrichment filled fields → let search/analytics/timeline learn.
      if (producer) {
        await producer
          .publish(TOPICS.ACCOUNTS, {
            type: 'account.updated',
            tenantId,
            payload: {
              accountId,
              name: account.name,
              ownerId: account.ownerId,
              changedFields: Object.keys(updates),
            },
          })
          .catch(() => undefined);
      }
    }

    await prisma.enrichmentJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        confidence: result.confidence,
        appliedFields: applied,
        rawData: result as object,
      },
    });
  } catch (err: unknown) {
    await prisma.enrichmentJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    });
  }
}

async function callEnrichmentProvider(
  type: 'contact' | 'account',
  input: { email?: string; company?: string; name?: string; website?: string }
): Promise<EnrichmentResult | null> {
  const clearbitKey = process.env.CLEARBIT_API_KEY;
  const apolloKey = process.env.APOLLO_API_KEY;

  if (clearbitKey && type === 'account' && (input.company || input.website)) {
    const domain = input.website?.replace(/^https?:\/\//, '').split('/')[0] || '';
    const clearbit = createHttpClient({
      baseURL: 'https://company.clearbit.com',
      headers: { Authorization: `Bearer ${clearbitKey}` },
      timeoutMs: 8_000,
      maxRetries: 2,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    });
    try {
      const data = await clearbit.get<{
        name?: string;
        category?: { industry?: string };
        metrics?: { employees?: number; annualRevenue?: number };
        domain?: string;
        description?: string;
      }>(`/v2/companies/find?domain=${encodeURIComponent(domain)}`);
      return {
        company: data.name,
        industry: data.category?.industry,
        employees: data.metrics?.employees,
        revenue: data.metrics?.annualRevenue,
        website: data.domain ? `https://${data.domain}` : undefined,
        description: data.description,
        confidence: 0.9,
      };
    } catch {
      // Silently skip enrichment on failure
    }
  }

  if (apolloKey && type === 'contact' && input.email) {
    const apollo = createHttpClient({
      baseURL: 'https://api.apollo.io',
      headers: { 'X-Api-Key': apolloKey, 'Content-Type': 'application/json' },
      timeoutMs: 8_000,
      maxRetries: 2,
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
    });
    try {
      const data = await apollo.post<{
        person?: {
          organization?: { name?: string; industry?: string; estimated_num_employees?: number };
          linkedin_url?: string;
          city?: string;
          country?: string;
        };
      }>('/v1/people/match', { email: input.email });
      const person = data.person;
      if (person) {
        return {
          company: person.organization?.name,
          industry: person.organization?.industry,
          employees: person.organization?.estimated_num_employees,
          linkedin: person.linkedin_url,
          city: person.city,
          country: person.country,
          confidence: 0.85,
        };
      }
    } catch {
      // Silently skip enrichment on failure
    }
  }

  return null;
}
