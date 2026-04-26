import { parse } from 'csv-parse';
import type { DataPrisma } from '../prisma.js';

interface CsvRow {
  [key: string]: string;
}

type FieldMap = Record<string, string>;

function authHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function createImportService(prisma: DataPrisma) {
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

    async processJob(jobId: string, csvBuffer: Buffer) {
      const job = await prisma.importJob.findUnique({ where: { id: jobId } });
      if (!job) return null;
      const fieldMap = (job.fieldMap as FieldMap) ?? {};
      const parser = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      await prisma.importJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });

      let imported = 0;
      let failed = 0;
      let totalRows = 0;
      const errors: Array<{ row: number; error: string }> = [];
      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';

      for await (const row of parser as AsyncIterable<CsvRow>) {
        totalRows += 1;
        const payload: Record<string, string> = {};
        for (const [csvKey, targetKey] of Object.entries(fieldMap)) {
          payload[targetKey] = row[csvKey] ?? '';
        }
        try {
          const res = await fetch(`${crmUrl}/api/v1/${job.module}`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const body = await res.text();
            failed += 1;
            errors.push({ row: totalRows, error: body.slice(0, 500) });
          } else {
            imported += 1;
          }
        } catch (err) {
          failed += 1;
          errors.push({
            row: totalRows,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const status = failed > 0 && imported === 0 ? 'FAILED' : 'COMPLETED';
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status,
          totalRows,
          imported,
          failed,
          errors,
          completedAt: new Date(),
        },
      });
      return prisma.importJob.findUnique({ where: { id: jobId } });
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
