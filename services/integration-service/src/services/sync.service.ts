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

      void runSyncJob(prisma, producer, tenantId, job.id);
      return job;
    },
  };
}

async function runSyncJob(
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

    // Fetch the job and its OAuth connection to determine the external source
    const job = await prisma.syncJob.findUnique({
      where: { id: jobId },
      include: { connection: true },
    });

    if (!job || !job.connection) {
      throw new Error('Sync job or connection not found');
    }

    // The actual sync implementation (fetch external data, map, write destination)
    // is pending. We update the job honestly rather than faking success.
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING_IMPLEMENTATION' as any,
        processedRecords: 0,
        totalRecords: 0,
        completedAt: new Date(),
        errorLog: [{ at: new Date().toISOString(), error: 'Sync logic not yet implemented for provider: ' + job.connection.provider }] as Prisma.InputJsonValue,
      },
    });

    await producer.publish(TOPICS.INTEGRATION, {
      type: 'integration.sync.pending_implementation',
      tenantId,
      payload: { jobId, tenantId, provider: job.connection.provider },
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
