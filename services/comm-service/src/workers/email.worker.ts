import { emailQueue, type EmailJobData } from '../queues/email.queue.js';
import { createSmtpChannel } from '../channels/smtp.channel.js';

const smtp = createSmtpChannel(console as any);

emailQueue.processJob<EmailJobData>('send-email', async (job) => {
  const data = job.data as EmailJobData;
  await smtp.send({
    to: data.to,
    subject: data.subject,
    html: data.html,
    from: data.from,
  });
  return { sent: true };
});

console.log('Email worker started');
