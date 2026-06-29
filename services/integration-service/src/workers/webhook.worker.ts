import { webhookQueue, type WebhookJobData } from '../queues/webhook.queue.js';

webhookQueue.processJob<WebhookJobData>('process-webhook', async (job) => {
  const data = job.data as WebhookJobData;
  const res = await fetch(data.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(data.secret ? { 'X-Webhook-Secret': data.secret } : {}),
    },
    body: JSON.stringify(data.payload),
  });
  if (!res.ok) throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  return { delivered: true, status: res.status };
});

console.log('Webhook worker started');
