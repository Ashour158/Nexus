import * as XLSX from 'xlsx';
import type { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';
import { SYSTEM_TEMPLATES } from '../templates/index.js';
import { executeReport, type QuerySpec } from './executor.service.js';

interface SaveReportInput {
  name: string;
  description?: string;
  category: string;
  datasource: string;
  querySpec: QuerySpec;
  isShared?: boolean;
}

function nextRunFromCron(cron: string): Date {
  const now = new Date();
  const parts = cron.split(/\s+/);
  const hour = Number(parts[1] ?? 8);
  const minute = Number(parts[0] ?? 0);
  const next = new Date(now);
  next.setHours(Number.isFinite(hour) ? hour : 8, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export function createReportsService(prisma: ReportingPrisma) {
  return {
    listTemplates(category?: string) {
      return SYSTEM_TEMPLATES.filter((tpl) => !category || tpl.category === category);
    },

    async listCustomReports(tenantId: string, category?: string) {
      return prisma.reportDefinition.findMany({
        where: { tenantId, category },
        orderBy: { updatedAt: 'desc' },
      });
    },

    async saveReport(tenantId: string, ownerId: string, input: SaveReportInput) {
      return prisma.reportDefinition.create({
        data: {
          tenantId,
          ownerId,
          name: input.name,
          description: input.description ?? null,
          category: input.category,
          datasource: input.datasource,
          querySpec: input.querySpec as Prisma.InputJsonValue,
          isShared: input.isShared ?? false,
        },
      });
    },

    async getReport(tenantId: string, reportId: string) {
      const template = SYSTEM_TEMPLATES.find((tpl) => tpl.id === reportId);
      if (template) return { ...template, tenantId: null, ownerId: null, isShared: true };
      return prisma.reportDefinition.findFirst({ where: { tenantId, id: reportId } });
    },

    async deleteReport(tenantId: string, reportId: string) {
      return prisma.reportDefinition.deleteMany({ where: { tenantId, id: reportId } });
    },

    async runReport(tenantId: string, reportId: string, params: Record<string, unknown>) {
      const report = await this.getReport(tenantId, reportId);
      if (!report) return null;
      return executeReport(
        tenantId,
        report.datasource,
        report.querySpec as QuerySpec,
        params
      );
    },

    async exportXlsx(tenantId: string, reportId: string, params: Record<string, unknown>) {
      const result = await this.runReport(tenantId, reportId, params);
      if (!result) return null;
      const sheet = XLSX.utils.json_to_sheet(result.rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
      return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    },

    async createSchedule(
      tenantId: string,
      reportId: string,
      input: { cron: string; format?: string; recipients: string[] }
    ) {
      return prisma.reportSchedule.create({
        data: {
          tenantId,
          reportId,
          cron: input.cron,
          format: input.format ?? 'xlsx',
          recipients: input.recipients,
          nextRunAt: nextRunFromCron(input.cron),
        },
      });
    },

    async listSchedules(tenantId: string, reportId: string) {
      return prisma.reportSchedule.findMany({
        where: { tenantId, reportId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async deleteSchedule(tenantId: string, scheduleId: string) {
      return prisma.reportSchedule.deleteMany({ where: { tenantId, id: scheduleId } });
    },

    async processSchedules() {
      const due = await prisma.reportSchedule.findMany({
        where: { isActive: true, nextRunAt: { lte: new Date() } },
        include: { report: true },
        take: 25,
      });
      for (const schedule of due) {
        await this.runReport(schedule.tenantId, schedule.reportId, {});
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date(), nextRunAt: nextRunFromCron(schedule.cron) },
        });
      }
      return { processed: due.length };
    },
  };
}
