import cronParser from 'cron-parser';
import type { ReportingPrisma } from '../prisma.js';
import { executeReport, exportToCsv, type ReportObjectType } from './report-engine.js';
import { executeReport as executeDefinitionReport, type QuerySpec } from '../services/executor.service.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const BATCH = 20;

/**
 * Compute the next fire time for a standard 5-field cron expression
 * (minute hour day-of-month month day-of-week), honoring steps (`*​/5`),
 * ranges (`1-5`), lists (`1,15`), day-of-month and month — via `cron-parser`.
 *
 * On an unparseable expression we fail safe to "one day later" so a bad cron can
 * never wedge the runner or produce an immediate hot-loop.
 */
export function computeNextRun(cronExpr: string, from: Date): Date {
  try {
    const it = cronParser.parseExpression(cronExpr, { currentDate: from });
    return it.next().toDate();
  } catch {
    const fallback = new Date(from);
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtmlBody(reportName: string, format: string, csv: string, now: Date, rowCount: number): string {
  return `
          <p>Your scheduled report <strong>${escapeHtml(reportName)}</strong> (${escapeHtml(format)}).</p>
          <pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(csv)}</pre>
          <p><small>Generated: ${now.toISOString()} — ${rowCount} row(s)</small></p>`;
}

/**
 * Deliver a rendered report to its recipients through the SAME comm-service
 * outbox email path both schedule models use. Throws on a non-2xx so the caller
 * records the failure (nextRunAt is still advanced by the caller's `finally`, so
 * a broken report never hot-loops every tick).
 */
async function deliverReportEmail(
  comm: string,
  svc: string,
  tenantId: string,
  recipients: string[],
  subject: string,
  htmlBody: string
): Promise<void> {
  const res = await fetch(`${comm}/api/v1/internal/outbox/email-broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': svc,
    },
    body: JSON.stringify({ tenantId, recipients, subject, htmlBody }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`email-broadcast failed: ${res.status} ${bodyText.slice(0, 500)}`);
  }
}

/** Process due ReportSchedule rows (self-serve builder / SavedReport). */
async function processSavedReportSchedules(
  prisma: ReportingPrisma,
  now: Date,
  comm: string,
  svc: string
): Promise<number> {
  const due = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { report: true },
    take: BATCH,
  });

  for (const schedule of due) {
    try {
      // Run the saved report of ANY dataset (was hard-cast to 'deals'). Datasets
      // the background path can't source degrade to an empty result rather than
      // throwing — see report-engine.executeReportViaServiceToken.
      const columns = schedule.report.columns as string[];
      const result = await executeReport(
        prisma,
        schedule.tenantId,
        {
          objectType: (schedule.report.objectType as ReportObjectType) ?? 'deals',
          columns,
          filters: (schedule.report.filters as never) ?? [],
          groupBy: schedule.report.groupBy ?? undefined,
          sortBy: schedule.report.sortBy ?? undefined,
          sortDir: (schedule.report.sortDir ?? 'desc') as 'desc',
          limit: 2000,
          offset: 0,
        },
        { serviceToken: svc }
      );

      const csv = await exportToCsv(result.rows, columns);
      await deliverReportEmail(
        comm,
        svc,
        schedule.tenantId,
        schedule.recipients as string[],
        schedule.subject ?? `Scheduled Report: ${schedule.report.name}`,
        buildHtmlBody(schedule.report.name, schedule.format, csv, now, result.rows.length)
      );
    } catch (err) {
      console.error(`ReportSchedule ${schedule.id} failed:`, err);
    } finally {
      // ALWAYS advance nextRunAt — even on failure — so a broken report can never
      // re-run every 60s in a hot loop. (This was the audit's dead path.)
      try {
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cron, now) },
        });
      } catch (err) {
        console.error(`ReportSchedule ${schedule.id} nextRunAt advance failed:`, err);
      }
    }
  }
  return due.length;
}

/**
 * Process due DefinitionReportSchedule rows (legacy template-based
 * ReportDefinition). This is the path RR-H20 flagged as never executing: the old
 * `processSchedules()` was never invoked and, even if it had been, only ran the
 * report without delivering. It now renders + delivers through the same outbox
 * email path as the self-serve schedules above.
 */
async function processDefinitionSchedules(
  prisma: ReportingPrisma,
  now: Date,
  comm: string,
  svc: string
): Promise<number> {
  const due = await prisma.definitionReportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { report: true },
    take: BATCH,
  });

  for (const schedule of due) {
    try {
      const spec = (schedule.report.querySpec ?? {}) as QuerySpec;
      const result = await executeDefinitionReport(schedule.tenantId, schedule.report.datasource, spec, {});
      const columns = spec.columns && spec.columns.length > 0 ? spec.columns : result.columns;
      const csv = await exportToCsv(result.rows, columns);
      await deliverReportEmail(
        comm,
        svc,
        schedule.tenantId,
        schedule.recipients as string[],
        `Scheduled Report: ${schedule.report.name}`,
        buildHtmlBody(schedule.report.name, schedule.format, csv, now, result.rows.length)
      );
    } catch (err) {
      console.error(`DefinitionReportSchedule ${schedule.id} failed:`, err);
    } finally {
      try {
        await prisma.definitionReportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt: computeNextRun(schedule.cron, now) },
        });
      } catch (err) {
        console.error(`DefinitionReportSchedule ${schedule.id} nextRunAt advance failed:`, err);
      }
    }
  }
  return due.length;
}

/**
 * Single consolidated pass over BOTH schedule models. Exported so it can be
 * driven by the interval runner (index.ts) or triggered directly
 * (reports.service.processSchedules / tests).
 */
export async function runDueSchedules(
  prisma: ReportingPrisma
): Promise<{ savedProcessed: number; definitionProcessed: number }> {
  const now = new Date();
  const svc = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const comm = process.env.COMM_SERVICE_URL ?? 'http://localhost:3009';

  const savedProcessed = await processSavedReportSchedules(prisma, now, comm, svc);
  const definitionProcessed = await processDefinitionSchedules(prisma, now, comm, svc);
  return { savedProcessed, definitionProcessed };
}

export function startScheduleRunner(prisma: ReportingPrisma): NodeJS.Timeout {
  // Reentrancy guard: a slow tick must not overlap the next interval fire, which
  // would double-run due schedules.
  let running = false;
  return setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runDueSchedules(prisma);
    } catch (err) {
      console.error('Schedule runner tick failed:', err);
    } finally {
      running = false;
    }
  }, CHECK_INTERVAL_MS);
}
