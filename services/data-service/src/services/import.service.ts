import type { NexusProducer } from '@nexus/kafka';
import type { DataPrisma } from '../prisma.js';
import { parseCsv } from '../lib/csv.js';
import { getModuleConfig, validateRow } from '../lib/import-modules.js';

type FieldMap = Record<string, string>;

interface RowError {
  row: number;
  error: string;
}

/** Rows are processed in chunks so a large file never blocks the event loop. */
const CHUNK_SIZE = 100;
/** Cap the persisted error report so a bad file can't bloat the DB row. */
const MAX_ERRORS = 500;

export function createImportService(prisma: DataPrisma, producer?: NexusProducer) {
  return {
    async createJob(
      tenantId: string,
      module: string,
      fileName: string,
      createdBy: string,
      fieldMap: FieldMap
    ) {
      return prisma.importJob.create({
        data: {
          tenantId,
          module,
          fileName,
          createdBy,
          fieldMap,
          status: 'PENDING',
        },
      });
    },

    /**
     * Parse the uploaded CSV, apply the column→field mapping, validate each
     * row, and emit a create event per valid row via the Kafka producer.
     *
     * Fail-open: a bad row is recorded in the per-row error report and skipped;
     * it never fails the whole job. Any unexpected error marks the job FAILED
     * but is caught so the request/service never crashes.
     */
    async processJob(jobId: string, csvBuffer: Buffer) {
      try {
        const job = await prisma.importJob.findUnique({ where: { id: jobId } });
        if (!job) return null;

        const fieldMap = (job.fieldMap as FieldMap) ?? {};
        const config = getModuleConfig(job.module);

        await prisma.importJob.update({
          where: { id: jobId },
          data: { status: 'PROCESSING' },
        });

        let parsed: ReturnType<typeof parseCsv>;
        try {
          parsed = parseCsv(csvBuffer.toString('utf8'));
        } catch (err) {
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              errors: [
                {
                  row: 0,
                  error: `CSV parse failed: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              completedAt: new Date(),
            },
          });
          return prisma.importJob.findUnique({ where: { id: jobId } });
        }

        const totalRows = parsed.rows.length;
        let imported = 0;
        let failed = 0;
        const errors: RowError[] = [];

        for (let start = 0; start < parsed.rows.length; start += CHUNK_SIZE) {
          const chunk = parsed.rows.slice(start, start + CHUNK_SIZE);

          await Promise.all(
            chunk.map(async (row, offset) => {
              // 1-based, header-aware row number for the error report.
              const rowNumber = start + offset + 2;
              try {
                // Apply column→field mapping. Keys are CSV columns, values are
                // target field names. Fall back to identity if no map given.
                const mapped: Record<string, string> = {};
                if (Object.keys(fieldMap).length > 0) {
                  for (const [csvKey, targetKey] of Object.entries(fieldMap)) {
                    mapped[targetKey] = row[csvKey] ?? '';
                  }
                } else {
                  Object.assign(mapped, row);
                }

                const result = validateRow(config, mapped);
                if (!result.ok) {
                  failed += 1;
                  if (errors.length < MAX_ERRORS) {
                    errors.push({ row: rowNumber, error: result.error });
                  }
                  return;
                }

                // Emit a create event for downstream services to persist.
                if (producer) {
                  await producer
                    .publish(config.topic, {
                      type: config.eventType,
                      tenantId: job.tenantId,
                      payload: {
                        ...result.value,
                        source: 'import',
                        importJobId: job.id,
                        createdBy: job.createdBy,
                      },
                    })
                    .catch((err) => {
                      throw err instanceof Error ? err : new Error(String(err));
                    });
                }
                imported += 1;
              } catch (err) {
                failed += 1;
                if (errors.length < MAX_ERRORS) {
                  errors.push({
                    row: rowNumber,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
            })
          );

          // Persist incremental progress so the SSE status endpoint can report it.
          await prisma.importJob
            .update({
              where: { id: jobId },
              data: { totalRows, imported, failed },
            })
            .catch(() => undefined);
        }

        const status = failed > 0 && imported === 0 ? 'FAILED' : 'COMPLETED';
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            status,
            totalRows,
            imported,
            failed,
            errors: errors as unknown as object[],
            completedAt: new Date(),
          },
        });
        return prisma.importJob.findUnique({ where: { id: jobId } });
      } catch (err) {
        // Fail-open: never let an unexpected error escape and crash the service.
        console.warn(`[import] processJob ${jobId} failed:`, err);
        await prisma.importJob
          .update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              errors: [
                { row: 0, error: err instanceof Error ? err.message : String(err) },
              ],
              completedAt: new Date(),
            },
          })
          .catch(() => undefined);
        return null;
      }
    },

    async getJob(tenantId: string, id: string) {
      return prisma.importJob.findFirst({ where: { tenantId, id } });
    },

    async listJobs(
      tenantId: string,
      module: string | undefined,
      page: number,
      limit: number
    ) {
      const where = { tenantId, module };
      const [data, total] = await Promise.all([
        prisma.importJob.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.importJob.count({ where }),
      ]);
      return { data, total, page, limit };
    },
  };
}
