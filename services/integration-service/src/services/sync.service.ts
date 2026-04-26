import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import type { Prisma } from '../../../../node_modules/.prisma/integration-client/index.js';
import type { StartSyncJobInput } from '@nexus/validation';
import type { IntegrationPrisma } from '../prisma.js';

export function createSyncService(prisma: IntegrationPrisma, producer: NexusProducer) {
  return {
    async listJobs() {
      return prisma.syncJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    },

    async startJob(tenantId: string, input: StartSyncJobInput) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { id: input.connectionId },
      });
      if (!conn) throw new NotFoundError('OAuthConnection', input.connectionId);

      const job = await prisma.syncJob.create({
        data: {
          tenantId,
          connectionId: input.connectionId,
          jobType: input.jobType,
          status: 'PENDING',
          totalRecords: 10,
        },
      });

      await producer.publish(TOPICS.INTEGRATION, {
        type: 'integration.sync.started',
        tenantId,
        payload: { jobId: job.id, tenantId, jobType: input.jobType },
      });

      void simulateJob(prisma, producer, tenantId, job.id);
      return job;
    },
  };
}

async function simulateJob(
  prisma: IntegrationPrisma,
  producer: NexusProducer,
  tenantId: string,
  jobId: string
): Promise<void> {
  try {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    await new Promise((r) => setTimeout(r, 400));

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        processedRecords: 10,
        totalRecords: 10,
        completedAt: new Date(),
      },
    });

    await producer.publish(TOPICS.INTEGRATION, {
      type: 'integration.sync.completed',
      tenantId,
      payload: { jobId, tenantId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync_failed';
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorLog: [{ at: new Date().toISOString(), error: msg }] as Prisma.InputJsonValue,
      },
    });
    await producer.publish(TOPICS.INTEGRATION, {
      type: 'integration.sync.failed',
      tenantId,
      payload: { jobId, tenantId, error: msg },
    });
  }
}
