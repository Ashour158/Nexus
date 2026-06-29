import { NexusQueue } from '@nexus/queue';

export interface EnrichmentJobData {
  contactId: string;
  tenantId: string;
  source?: 'clearbit' | 'zoominfo' | 'manual';
}

export const enrichmentQueue = new NexusQueue('crm:enrichment', {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10000 } },
});
