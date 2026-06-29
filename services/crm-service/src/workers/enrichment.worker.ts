import { enrichmentQueue, type EnrichmentJobData } from '../queues/enrichment.queue.js';

enrichmentQueue.processJob('enrich-contact', async (job: { data: EnrichmentJobData }) => {
  const data = job.data as EnrichmentJobData;
  // Contact enrichment logic would go here
  console.log(`Enriching contact ${data.contactId} from ${data.source ?? 'default'}`);
  return { enriched: true };
});

console.log('Enrichment worker started');
