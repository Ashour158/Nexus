import { NexusQueue } from '@nexus/queue';

export interface WebhookJobData {
  webhookId: string;
  tenantId: string;
  url: string;
  payload: Record<string, unknown>;
  secret?: string;
  retryCount?: number;
}

export const webhookQueue = new NexusQueue('integration:webhook', {
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
});
