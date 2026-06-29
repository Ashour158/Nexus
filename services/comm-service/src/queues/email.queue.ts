import { NexusQueue } from '@nexus/queue';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
  tenantId: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}

export const emailQueue = new NexusQueue('comm:email', {
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 } },
});
