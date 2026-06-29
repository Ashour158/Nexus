import { NexusQueue } from '@nexus/queue';

export interface InvoiceJobData {
  invoiceId: string;
  tenantId: string;
  action: 'ZATCA_SUBMIT' | 'ZATCA_REPORT' | 'SEND';
  payload?: Record<string, unknown>;
}

export const invoiceQueue = new NexusQueue('finance:invoice', {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});
