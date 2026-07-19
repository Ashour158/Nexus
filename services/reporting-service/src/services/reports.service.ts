import * as XLSX from 'xlsx';
import type { Prisma } from '../../../../node_modules/.prisma/reporting-client/index.js';
import type { ReportingPrisma } from '../prisma.js';
import { SYSTEM_TEMPLATES } from '../templates/index.js';
import { executeReport, type QuerySpec } from './executor.service.js';
import { analyticsClient } from '../lib/analytics-client.js';
import { computeNextRun, runDueSchedules } from '../lib/schedule-runner.js';
import {
  fetchCanonicalDeals,
  isLostDeal,
  isWonDeal,
  summarizeDeals,
  type CanonicalDeal,
} from '../lib/canonical-deals.js';

/**
 * Reads the most recent daily PipelineSnapshot rows for a tenant and rolls them
 * up into headline metrics. Used as the fallback/cache when analytics-service is
 * unreachable, so reporting degrades to the last daily snapshot instead of zeros.
 */
async function snapshotFallbackMetrics(
  prisma: ReportingPrisma,
  tenantId: string
): Promise<{ totalDeals: number; totalValue: number; avgDealSize: number; snapshotDate: string | null }> {
  try {
    const latest = await prisma.pipelineSnapshot.findFirst({
      where: { tenantId },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true, pipelineId: true },
    });
    if (!latest) return { totalDeals: 0, totalValue: 0, avgDealSize: 0, snapshotDate: null };

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
      snapshotDate: new Date(latest.snapshotDate).toISOString(),
    };
  } catch {
    return { totalDeals: 0, totalValue: 0, avgDealSize: 0, snapshotDate: null };
  }
}

function currentPeriod(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function currentPeriodRange(): { from: Date; to: Date } {
  const { year, quarter } = currentPeriod();
  return {
    from: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
    to: new Date(),
  };
}

function performanceRows(deals: CanonicalDeal[]) {
  return deals.map((deal) => ({
    id: deal.id,
    date: deal.updatedAt ?? deal.createdAt ?? '',
    customer: deal.name ?? 'Unnamed deal',
    customerSubtitle: deal.accountId ?? '',
    ownerName: deal.ownerId ?? 'Unassigned',
    ownerAvatar: null,
    dealValue: Number(deal.amount ?? deal.value ?? 0) || 0,
    status: isWonDeal(deal)
      ? 'CLOSED WON'
      : isLostDeal(deal)
        ? 'CLOSED LOST'
        : 'IN PROGRESS',
  }));
}

function repPerformance(deals: CanonicalDeal[]) {
  const groups = new Map<string, CanonicalDeal[]>();
  for (const deal of deals) {
    const ownerId = deal.ownerId ?? 'unassigned';
    const rows = groups.get(ownerId) ?? [];
    rows.push(deal);
    groups.set(ownerId, rows);
  }
  return [...groups.entries()].map(([ownerId, rows]) => {
    const metrics = summarizeDeals(rows);
    return {
      ownerId,
      wonAmount: metrics.wonAmount,
      totalRevenue: metrics.wonAmount,
      pipelineValue: metrics.pipelineValue,
      weightedPipeline: metrics.weightedPipeline,
      wonDeals: metrics.wonDeals,
      lostDeals: metrics.lostDeals,
      openDeals: metrics.openDeals,
      winRatePct: metrics.winRatePct,
      winRate: metrics.winRatePct,
    };
  });
}

interface SaveReportInput {
  name: string;
  description?: string;
  category: string;
  datasource: string;
  querySpec: QuerySpec;
  isShared?: boolean;
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
          nextRunAt: computeNextRun(input.cron, new Date()),
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

    /**
     * Manual/test trigger for the scheduled-report pipeline. Delegates to the
     * single consolidated runner (schedule-runner.runDueSchedules) which renders
     * AND delivers both schedule models via the comm outbox — the periodic
     * execution is driven by startScheduleRunner in index.ts. Previously this was
     * a divergent no-op (never invoked, and it never delivered).
     */
    async processSchedules() {
      const { savedProcessed, definitionProcessed } = await runDueSchedules(prisma);
      return { processed: savedProcessed + definitionProcessed, savedProcessed, definitionProcessed };
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
      const range = currentPeriodRange();
      const [deals, revenue, byRep, forecast] = await Promise.all([
        fetchCanonicalDeals(tenantId, range).catch(() => null),
        analyticsClient.getRevenueSummary(tenantId, period),
        analyticsClient.getRevenueByRep(tenantId, period),
        analyticsClient.getForecast(tenantId),
      ]);

      if (deals) {
        const metrics = summarizeDeals(deals);
        return {
          ...metrics,
          decidedDeals: metrics.wonDeals + metrics.lostDeals,
          avgDealSize: metrics.avgWonDealSize,
          avgOpenDealSize:
            metrics.openDeals > 0 ? metrics.pipelineValue / metrics.openDeals : 0,
          winRate: metrics.winRatePct,
          reps: repPerformance(deals),
          performance: performanceRows(deals),
          territory: [],
          events: [],
          period: `${period.year}-Q${period.quarter}`,
          periodRange: { from: range.from.toISOString(), to: range.to.toISOString() },
          source: 'crm-read-model',
          refreshedAt: new Date().toISOString(),
          generatedAt: new Date().toISOString(),
          snapshotAt: null,
        };
      }

      const live = revenue !== null || byRep !== null || forecast !== null;
      const snap = forecast ? null : await snapshotFallbackMetrics(prisma, tenantId);
      const wonDeals = revenue?.wonDeals ?? 0;
      const lostDeals = revenue?.lostDeals ?? 0;
      const decidedDeals = wonDeals + lostDeals;
      const wonAmount = revenue !== null
        ? revenue.wonAmount ?? revenue.totalRevenue
        : null;
      const pipelineRaw = forecast ? Number(forecast.totalPipeline) : NaN;
      const pipelineValue = Number.isFinite(pipelineRaw) ? pipelineRaw : snap?.totalValue ?? null;
      const openDeals = snap?.totalDeals ?? null;
      const weightedPipelineRaw = forecast ? Number(forecast.weightedPipeline) : NaN;
      const weightedPipeline = Number.isFinite(weightedPipelineRaw) ? weightedPipelineRaw : null;
      const avgWonDealSize =
        revenue?.avgSalePrice ?? (wonAmount !== null && wonDeals > 0 ? wonAmount / wonDeals : 0);
      const avgOpenDealSize = snap?.avgDealSize ?? null;
      const winRatePct =
        revenue?.winRatePct ??
        revenue?.winRate ??
        (decidedDeals > 0 ? (wonDeals / decidedDeals) * 100 : 0);

      return {
        reps: byRep ?? [],

        // ── Honest, non-overlapping metric names ─────────────────────────────
        /** Sum of `amount` over deals with status WON in the period. Null = not derivable. */
        wonAmount,
        /** Sum of `amount` over deals still open. NOT revenue. */
        pipelineValue,
        /** Sum of `amount * probability/100` over open deals. Null = not derivable. */
        weightedPipeline,
        /** Count of deals with status WON in the period. */
        wonDeals,
        /** Count of deals with status LOST in the period. */
        lostDeals,
        /** wonDeals + lostDeals — the denominator of winRatePct. */
        decidedDeals,
        /** Count of deals still open. */
        openDeals,
        avgWonDealSize,
        avgOpenDealSize,
        /** 0-100. wonDeals / (wonDeals + lostDeals) * 100, 0 when nothing closed. */
        winRatePct,

        // ── Backward-compatible aliases (won-only meaning, NOT the old one) ───
        /** @deprecated use `wonAmount`. Won-only; no longer the sum of all deals. */
        totalRevenue: wonAmount ?? 0,
        /** @deprecated use `wonDeals`. */
        totalDeals: wonDeals + lostDeals + (openDeals ?? 0),
        /** @deprecated use `avgWonDealSize`. */
        avgDealSize: avgWonDealSize,
        /** @deprecated use `winRatePct` (identical 0-100 scale). */
        winRate: winRatePct,

        period: period.quarter ? `${period.year}-Q${period.quarter}` : String(period.year),
        source: live ? 'analytics' : 'snapshot',
        /** When this payload was computed; for snapshot source, the snapshot's own date. */
        generatedAt: new Date().toISOString(),
        snapshotAt: snap?.snapshotDate ?? null,
        performance: [],
        territory: [],
        events: [],
        periodRange: { from: range.from.toISOString(), to: range.to.toISOString() },
        refreshedAt: new Date().toISOString(),
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
