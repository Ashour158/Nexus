import { writeFile } from 'node:fs/promises';
import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import type { Prisma } from '../../../../node_modules/.prisma/data-client/index.js';
import { createImportService } from './import.service.js';
import { createExportService, type ExportFormat } from './export.service.js';
import { createMappingTemplateService, resolveMappings } from './mapping-template.service.js';
import { computeNextRun } from '../lib/cron.js';

export type DataJobKind = 'IMPORT' | 'EXPORT';

/** Loosely-typed view of a ScheduledDataJob's `config` JSON. */
interface JobConfig {
  // IMPORT
  source?: { csvBase64?: string; url?: string };
  mappingTemplateId?: string;
  fieldMap?: Record<string, string>;
  transforms?: Record<string, string>;
  fileName?: string;
  // EXPORT
  destination?: { type?: 'file' | 'inline'; path?: string };
  filter?: Record<string, unknown>;
  columns?: string[];
  format?: ExportFormat;
}

export interface JobInput {
  name: string;
  kind: DataJobKind;
  module: string;
  config: JobConfig;
  cron: string;
  isActive?: boolean;
}

/** How many due jobs a single poller tick will run, newest-cron-due first. */
const RUN_BATCH = 25;

export function createDataJobService(prisma: DataPrisma, producer?: NexusProducer) {
  const importService = createImportService(prisma, producer);
  const exportService = createExportService(prisma);
  const templates = createMappingTemplateService(prisma);

  /**
   * Execute a single job once: run the import/export, write a DataJobRun history
   * row, and (always, even on failure) advance the schedule. `authToken` is
   * forwarded to source services for a user-triggered "run now"; the background
   * poller passes none and falls back to the internal service token.
   */
  async function runOne(
    job: {
      id: string;
      tenantId: string;
      kind: DataJobKind;
      module: string;
      config: unknown;
      cron: string;
    },
    authToken?: string
  ): Promise<{ status: 'SUCCESS' | 'FAILED'; rowCount: number; error?: string }> {
    const now = new Date();
    const cfg = (job.config ?? {}) as JobConfig;

    const run = await prisma.dataJobRun.create({
      data: {
        tenantId: job.tenantId,
        jobId: job.id,
        kind: job.kind,
        status: 'RUNNING',
      },
    });

    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let rowCount = 0;
    let error: string | undefined;
    let outputLocation: string | undefined;

    try {
      if (job.kind === 'EXPORT') {
        const format: ExportFormat = cfg.format === 'json' ? 'json' : 'csv';
        const result = await exportService.exportData(
          job.tenantId,
          job.module,
          cfg.filter,
          cfg.columns,
          format,
          authToken
        );
        rowCount = result.rowCount;

        if (cfg.destination?.type === 'file' && cfg.destination.path) {
          await writeFile(cfg.destination.path, result.payload, 'utf8');
          outputLocation = `file:${cfg.destination.path}`;
        } else {
          // No blob store in this service — record the payload size so the run
          // history is meaningful without persisting the (potentially large) body.
          outputLocation = `inline:${Buffer.byteLength(result.payload)}b`;
        }
      } else {
        // IMPORT — resolve the CSV source.
        let csv: Buffer | null = null;
        if (cfg.source?.csvBase64) {
          csv = Buffer.from(cfg.source.csvBase64, 'base64');
        } else if (cfg.source?.url) {
          const res = await fetch(cfg.source.url, {
            headers: authToken ? { Authorization: authToken } : undefined,
          });
          if (!res.ok) {
            throw new Error(`Import source fetch failed (status ${res.status})`);
          }
          csv = Buffer.from(await res.arrayBuffer());
        } else {
          throw new Error('Import job config.source must provide csvBase64 or url');
        }

        // Resolve the effective mapping from a template and/or inline fieldMap.
        let fieldMap: Record<string, string> = cfg.fieldMap ?? {};
        let transforms: Record<string, string> | undefined = cfg.transforms;
        if (cfg.mappingTemplateId) {
          const tpl = await templates.get(job.tenantId, cfg.mappingTemplateId);
          if (tpl) {
            const resolved = resolveMappings(tpl.mappings);
            fieldMap = { ...resolved.fieldMap, ...(cfg.fieldMap ?? {}) };
            transforms = { ...resolved.transforms, ...(cfg.transforms ?? {}) };
          }
        }

        const created = await importService.createJob(
          job.tenantId,
          job.module,
          cfg.fileName ?? `scheduled-${job.id}.csv`,
          'scheduler',
          fieldMap
        );
        // Await so the run history reflects the real outcome.
        const finished = await importService.processJob(created.id, csv, transforms);
        rowCount = finished?.imported ?? 0;
        if (finished?.status === 'FAILED') {
          status = 'FAILED';
          const errs = Array.isArray(finished.errors) ? finished.errors : [];
          error = `Import failed (${finished.failed} row(s) rejected)`;
          if (errs.length > 0) {
            const first = errs[0] as { error?: string };
            if (first?.error) error += `: ${first.error}`;
          }
        }
      }
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message : String(err);
    }

    // Record the run outcome.
    await prisma.dataJobRun
      .update({
        where: { id: run.id },
        data: {
          status,
          rowCount,
          outputLocation: outputLocation ?? null,
          error: error ?? null,
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);

    // ALWAYS advance the schedule — even on failure — so a broken job can never
    // hot-loop on every poller tick.
    await prisma.scheduledDataJob
      .update({
        where: { id: job.id },
        data: {
          lastRunAt: now,
          lastStatus: status,
          nextRunAt: computeNextRun(job.cron, now),
        },
      })
      .catch(() => undefined);

    return { status, rowCount, error };
  }

  return {
    async create(tenantId: string, createdBy: string, input: JobInput) {
      const now = new Date();
      return prisma.scheduledDataJob.create({
        data: {
          tenantId,
          createdBy,
          name: input.name,
          kind: input.kind,
          module: input.module,
          config: (input.config ?? {}) as unknown as Prisma.InputJsonValue,
          cron: input.cron,
          isActive: input.isActive ?? true,
          nextRunAt: computeNextRun(input.cron, now),
        },
      });
    },

    async list(
      tenantId: string,
      opts: { kind?: DataJobKind; module?: string; page: number; limit: number }
    ) {
      const where = {
        tenantId,
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.module ? { module: opts.module } : {}),
      };
      const [data, total] = await Promise.all([
        prisma.scheduledDataJob.findMany({
          where,
          skip: (opts.page - 1) * opts.limit,
          take: opts.limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.scheduledDataJob.count({ where }),
      ]);
      return { data, total, page: opts.page, limit: opts.limit };
    },

    async get(tenantId: string, id: string) {
      return prisma.scheduledDataJob.findFirst({ where: { id, tenantId } });
    },

    async update(tenantId: string, id: string, patch: Partial<JobInput>) {
      const existing = await prisma.scheduledDataJob.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      const data: Prisma.ScheduledDataJobUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.module !== undefined) data.module = patch.module;
      if (patch.kind !== undefined) data.kind = patch.kind;
      if (patch.isActive !== undefined) data.isActive = patch.isActive;
      if (patch.config !== undefined) data.config = patch.config as unknown as Prisma.InputJsonValue;
      if (patch.cron !== undefined) {
        data.cron = patch.cron;
        // Recompute the next fire time whenever the cadence changes.
        data.nextRunAt = computeNextRun(patch.cron, new Date());
      }
      return prisma.scheduledDataJob.update({ where: { id: existing.id }, data });
    },

    async remove(tenantId: string, id: string) {
      const existing = await prisma.scheduledDataJob.findFirst({ where: { id, tenantId } });
      if (!existing) return null;
      return prisma.scheduledDataJob.delete({ where: { id: existing.id } });
    },

    async listRuns(tenantId: string, jobId: string, page: number, limit: number) {
      const where = { tenantId, jobId };
      const [data, total] = await Promise.all([
        prisma.dataJobRun.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { startedAt: 'desc' },
        }),
        prisma.dataJobRun.count({ where }),
      ]);
      return { data, total, page, limit };
    },

    /** User-triggered "run now" for a single job (tenant-scoped). */
    async runNow(tenantId: string, id: string, authToken?: string) {
      const job = await prisma.scheduledDataJob.findFirst({ where: { id, tenantId } });
      if (!job) return null;
      return runOne(
        {
          id: job.id,
          tenantId: job.tenantId,
          kind: job.kind as DataJobKind,
          module: job.module,
          config: job.config,
          cron: job.cron,
        },
        authToken
      );
    },

    /**
     * Poller entry point: run every active job whose nextRunAt has passed. Each
     * job is tenant-pinned via its own row; runOne records history + advances the
     * schedule. Returns how many jobs were processed this pass.
     */
    async runDue(now: Date = new Date()): Promise<number> {
      const due = await prisma.scheduledDataJob.findMany({
        where: { isActive: true, nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' },
        take: RUN_BATCH,
      });
      for (const job of due) {
        try {
          await runOne({
            id: job.id,
            tenantId: job.tenantId,
            kind: job.kind as DataJobKind,
            module: job.module,
            config: job.config,
            cron: job.cron,
          });
        } catch (err) {
          console.error(`[data-job] job ${job.id} run failed:`, err);
        }
      }
      return due.length;
    },
  };
}
