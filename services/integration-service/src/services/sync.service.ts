import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { NotFoundError } from '@nexus/service-utils';
import type { Prisma } from '../../../../node_modules/.prisma/integration-client/index.js';
import type { StartSyncJobInput } from '@nexus/validation';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';
import { createGoogleGmailService } from './google-gmail.service.js';
import { createGoogleCalendarService } from './google-calendar.service.js';
import { createOauthService } from './oauth.service.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;

export function createSyncService(
  prisma: IntegrationPrisma,
  producer: NexusProducer,
  crypto: FieldCrypto
) {
  return {
    async listJobs() {
      return prisma.syncJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    },

    /**
     * Read the connector-level sync state (status, cursor, last error, counts)
     * for a connection. Lets callers observe/resume without inspecting jobs.
     * Fail-open: returns null if the connection is missing.
     */
    async getConnectorSyncState(connectionId: string) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { id: connectionId },
        select: {
          id: true,
          provider: true,
          syncStatus: true,
          syncCursor: true,
          lastSyncedAt: true,
          lastSyncError: true,
          syncedRecords: true,
        },
      });
      return conn ?? null;
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

      void runSyncJob(prisma, producer, crypto, tenantId, job.id);
      return job;
    },
  };
}

async function runSyncJob(
  prisma: IntegrationPrisma,
  producer: NexusProducer,
  crypto: FieldCrypto,
  tenantId: string,
  jobId: string
): Promise<void> {
  let connectionId: string | undefined;
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
    connectionId = job.connectionId;

    // Mark connector as syncing (observable). Fail-open — never abort the sync.
    await markConnectorState(prisma, connectionId, { syncStatus: 'RUNNING', lastSyncError: null });

    let processedRecords = 0;

    if (job.connection.provider === 'google' && job.jobType === 'GMAIL_SYNC') {
      const gmail = createGoogleGmailService(prisma, crypto, createOauthService(prisma, crypto));
      const result = await gmail.syncGmailThreads(tenantId, job.connection.userId);
      processedRecords = result.synced;
    } else if (job.connection.provider === 'google' && job.jobType === 'CALENDAR_SYNC') {
      const calendar = createGoogleCalendarService(prisma, crypto);
      const result = await calendar.syncGoogleCalendar(tenantId, job.connection.userId);
      processedRecords = result.synced;
    } else {
      // Provider/type not yet wired — complete with 0 records rather than leaving RUNNING
      processedRecords = 0;
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        processedRecords,
        completedAt: new Date(),
        errorLog: [] as Prisma.InputJsonValue,
      },
    });

    // Record connector sync state: successful run advances lastSyncedAt and
    // accumulates the running total of synced records (resumable/observable).
    if (connectionId) {
      await markConnectorState(prisma, connectionId, {
        syncStatus: 'COMPLETED',
        lastSyncedAt: new Date(),
        lastSyncError: null,
        syncedRecords: { increment: processedRecords },
      });
    }

    await producer.publish(TOPICS.INTEGRATION, {
      type: 'integration.sync.completed',
      tenantId,
      payload: { jobId, tenantId, processedRecords },
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
    if (connectionId) {
      await markConnectorState(prisma, connectionId, {
        syncStatus: 'FAILED',
        lastSyncError: msg.slice(0, 2000),
      });
    }
    await producer.publish(TOPICS.INTEGRATION, {
      type: 'integration.sync.failed',
      tenantId,
      payload: { jobId, tenantId, error: msg },
    });
  }
}

/**
 * Persist connector-level sync state on OAuthConnection. Fail-open: a failure
 * here (e.g. schema drift before `prisma db push`) is logged and swallowed so
 * it can never abort or fail an otherwise-successful sync run.
 */
async function markConnectorState(
  prisma: IntegrationPrisma,
  connectionId: string,
  data: {
    syncStatus?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
    syncCursor?: string | null;
    lastSyncedAt?: Date;
    lastSyncError?: string | null;
    syncedRecords?: number | { increment: number };
  }
): Promise<void> {
  try {
    await prisma.oAuthConnection.update({
      where: { id: connectionId },
      data: data as Prisma.OAuthConnectionUpdateInput,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sync] failed to persist connector sync state; continuing', err);
  }
}
