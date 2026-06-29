import { invoiceQueue, type InvoiceJobData } from '../queues/invoice.queue.js';

invoiceQueue.processJob<InvoiceJobData>('process-invoice', async (job) => {
  const data = job.data as InvoiceJobData;
  // ZATCA submission logic would go here
  console.log(`Processing invoice ${data.invoiceId} action ${data.action}`);
  return { processed: true };
});

console.log('Invoice worker started');
