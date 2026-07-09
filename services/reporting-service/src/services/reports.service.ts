import * as XLSX from 'xlsx';
import type { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';
import { SYSTEM_TEMPLATES } from '../templates/index.js';
import { executeReport, type QuerySpec } from './executor.service.js';
import { analyticsClient } from '../lib/analytics-client.js';

/**
 * Reads the most recent daily PipelineSnapshot rows for a tenant and rolls them
 * up into headline metrics. Used as the fallback/cache when analytics-service is
 * unreachable, so reporting degrades to the last daily snapshot instead of zeros.
 */
async function snapshotFallbackMetrics(
  prisma: ReportingPrisma,
  tenantId: string
): Promise<{ totalDeals: number; totalValue: number; avgDealSize: number }> {
  try {
    const latest = await prisma.pipelineSnapshot.findFirst({
      where: { tenantId },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true, pipelineId: true },
    });
    if (!latest) return { totalDeals: 0, totalValue: 0, avgDealSize: 0 };

    const rows = await prisma.pipelineSnapshot.findMany({
      where: {
        tenantId,
        pipelineId: latest.pipelineId,
        snapshotDate: latest.snapshotDate,
      },
      select: { dealCount: true, totalValue: true },
    });

    let totalDeals = 0;
    let totalValue = 0;
    for (const r of rows) {
      totalDeals += r.dealCount;
      totalValue += Number(r.totalValue);
    }
    return {
      totalDeals,
      totalValue,
      avgDealSize: totalDeals > 0 ? totalValue / totalDeals : 0,
    };
  } catch {
    return { totalDeals: 0, totalValue: 0, avgDealSize: 0 };
  }
}

function currentPeriod(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

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
      return prisma.definitionReportSchedule.create({
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
      return prisma.definitionReportSchedule.findMany({
        where: { tenantId, reportId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async deleteSchedule(tenantId: string, scheduleId: string) {
      return prisma.definitionReportSchedule.deleteMany({ where: { tenantId, id: scheduleId } });
    },

    async processSchedules() {
      const due = await prisma.definitionReportSchedule.findMany({
        where: { isActive: true, nextRunAt: { lte: new Date() } },
        include: { report: true },
        take: 25,
      });
      for (const schedule of due) {
        await this.runReport(schedule.tenantId, schedule.reportId, {});
        await prisma.definitionReportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date(), nextRunAt: nextRunFromCron(schedule.cron) },
        });
      }
      return { processed: due.length };
    },

    /**
     * Live rep-performance report, backed by analytics-service (ClickHouse read
     * model) for revenue/win-rate/per-rep breakdown and pipeline shape.
     *
     * Guarded: every cross-service call can return null (timeout/unreachable/
     * non-2xx). When revenue analytics is unavailable we fall back to the latest
     * daily PipelineSnapshot for deal counts/value, and to zeros otherwise —
     * this method never throws.
     */
    async getPerformanceReport(tenantId: string) {
      const period = currentPeriod();
      const [revenue, byRep, pipeline] = await Promise.all([
        analyticsClient.getRevenueSummary(tenantId, period),
        analyticsClient.getRevenueByRep(tenantId, period),
        analyticsClient.getPipelineSummary(tenantId),
      ]);

      // Prefer live numbers; degrade to the daily snapshot when analytics is down.
      let totalDeals = revenue?.wonDeals ?? pipeline?.totalDeals ?? 0;
      let totalRevenue = revenue?.totalRevenue ?? pipeline?.totalValue ?? 0;
      let avgDealSize =
        revenue?.avgSalePrice ??
        pipeline?.avgDealSize ??
        (totalDeals > 0 ? totalRevenue / totalDeals : 0);
      const winRate = revenue?.winRate ?? 0;
      const live = revenue !== null || byRep !== null || pipeline !== null;

      if (!live) {
        const snap = await snapshotFallbackMetrics(prisma, tenantId);
        totalDeals = snap.totalDeals;
        totalRevenue = snap.totalValue;
        avgDealSize = snap.avgDealSize;
      }

      return {
        reps: byRep ?? [],
        totalRevenue,
        totalDeals,
        avgDealSize,
        winRate,
        period: period.quarter ? `${period.year}-Q${period.quarter}` : String(period.year),
        source: live ? 'analytics' : 'snapshot',
      };
    },

    /**
     * Live manager report: weighted forecast, pipeline shape, and activity
     * summary from analytics-service. Guarded the same way as
     * getPerformanceReport — falls back to the daily snapshot / empty and never
     * throws when analytics is unreachable.
     */
    async getManagerReport(tenantId: string) {
      const [forecast, pipeline, activity] = await Promise.all([
        analyticsClient.getForecast(tenantId),
        analyticsClient.getPipelineSummary(tenantId),
        analyticsClient.getActivitySummary(tenantId),
      ]);

      const live = forecast !== null || pipeline !== null || activity !== null;
      const snap = live ? null : await snapshotFallbackMetrics(prisma, tenantId);

      return {
        forecast: forecast ? [forecast] : [],
        pipeline:
          pipeline ??
          (snap
            ? {
                totalDeals: snap.totalDeals,
                totalValue: snap.totalValue,
                avgDealSize: snap.avgDealSize,
                avgDaysInPipeline: 0,
              }
            : null),
        activity: activity ?? null,
        pipelineRisk: [] as unknown[],
        coachingOpportunities: [] as unknown[],
        period: 'current_quarter',
        source: live ? 'analytics' : 'snapshot',
      };
    },
  };
}
